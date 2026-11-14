import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type {
  ProjectPreparationRecovery,
  ProjectResumeStatus,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { canonicalPath } from "../../shared/storage/canonical-path";
import {
  openProjectWorkspace,
  projectAttemptNumber,
  readProjectJournal,
  type ProjectJournal,
  type ProjectLayout,
} from "./project-workspace";
import { frozenSpecificationPath } from "./project-preparation.spec";

const maxReportedMissingFiles = 20;

export type ProjectResumeInspection = {
  /** Canonical layout for the existing project folder when it can be opened. */
  layout: ProjectLayout | null;
  journal: ProjectJournal | null;
  status: Exclude<
    ProjectResumeStatus,
    "not_applicable" | "attempts_exhausted" | "settling"
  >;
  message: string | null;
  path: string | null;
  missingFiles: string[];
  missingFileCount: number;
};

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function hash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function inside(root: string, candidate: string) {
  const value = relative(root, candidate);
  return (
    Boolean(value) &&
    value !== ".." &&
    !value.startsWith(".." + sep) &&
    !isAbsolute(value)
  );
}

function inspection(
  status: ProjectResumeInspection["status"],
  message: string,
  extra: Partial<ProjectResumeInspection> = {},
): ProjectResumeInspection {
  return {
    layout: null,
    journal: null,
    status,
    message,
    path: null,
    missingFiles: [],
    missingFileCount: 0,
    ...extra,
  };
}

/**
 * Resume is only offered when the existing folder and its generated-file
 * journal can be trusted. Tracked missing files are reported so the new run can
 * recreate them, but modified, symlinked, unreadable, or unjournaled essential
 * files fail closed. Files that Grill Me never wrote are not inspected here and
 * remain untouchable to the project tools.
 */
export async function inspectProjectResume(input: {
  projectPath: string;
  projectDirectory: string;
}): Promise<ProjectResumeInspection> {
  const folderAttempt = projectAttemptNumber(input.projectDirectory);
  if (!folderAttempt)
    return inspection(
      "unavailable",
      "The saved project folder name is invalid, so it cannot be resumed.",
    );
  let opened: Awaited<ReturnType<typeof openProjectWorkspace>>;
  try {
    opened = await openProjectWorkspace({
      root: dirname(input.projectPath),
      projectDirectory: input.projectDirectory,
    });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "PROJECT_NOT_FOUND")
        return inspection(
          "project_missing",
          "The previous project folder no longer exists.",
        );
      if (error.code === "PROJECT_METADATA_INVALID")
        return inspection(
          "journal_invalid",
          "The previous project journal is corrupt or belongs to another folder. Its files were not changed.",
        );
      if (
        error.code === "PROJECT_METADATA_UNAVAILABLE" ||
        error.code === "PROJECT_ROOT_UNAVAILABLE" ||
        error.code === "PROJECT_LAYOUT_INVALID"
      )
        return inspection(
          "journal_unavailable",
          "The previous project folder or its journal is unavailable.",
        );
      return inspection(
        "unavailable",
        "The previous project folder cannot be inspected for resume.",
      );
    }
    return inspection(
      "unavailable",
      "The previous project folder cannot be inspected for resume.",
    );
  }

  const { layout } = opened;
  let journal = opened.journal;
  if (!journal) {
    // A race can remove the journal after the folder opens. Re-read once so a
    // missing journal is never reported as available.
    try {
      journal = await readProjectJournal(layout);
    } catch {
      return inspection(
        "journal_invalid",
        "The previous project journal is corrupt. Its files were not changed.",
        { layout },
      );
    }
  }
  if (!journal)
    return inspection(
      "journal_missing",
      "The previous project journal is missing. Resume cannot prove which files Grill Me wrote.",
      { layout },
    );
  if (!journal.files[frozenSpecificationPath])
    return inspection(
      "journal_invalid",
      "The previous project journal does not track CHALLENGE.md, so the frozen contract cannot be verified.",
      { layout, journal },
    );

  const missingFiles: string[] = [];
  let missingFileCount = 0;
  for (const [relativePath, record] of Object.entries(journal.files)) {
    const target = join(layout.projectRoot, relativePath);
    let info;
    try {
      info = await lstat(target);
    } catch (error) {
      if (fsCode(error) === "ENOENT") {
        missingFileCount += 1;
        if (missingFiles.length < maxReportedMissingFiles)
          missingFiles.push(relativePath);
        continue;
      }
      return inspection(
        "journal_unavailable",
        "A tracked project file could not be inspected, so resume did not start.",
        { layout, journal, path: relativePath },
      );
    }
    if (info.isSymbolicLink() || !info.isFile())
      return inspection(
        "file_modified",
        "A tracked project file is no longer a regular file. Resume did not start so it cannot be replaced.",
        { layout, journal, path: relativePath },
      );
    let canonical: string;
    try {
      canonical = await canonicalPath(target);
    } catch {
      return inspection(
        "journal_unavailable",
        "A tracked project file could not be resolved, so resume did not start.",
        { layout, journal, path: relativePath },
      );
    }
    if (
      canonical !== layout.projectRoot &&
      !inside(layout.projectRoot, canonical)
    )
      return inspection(
        "file_modified",
        "A tracked project file resolves outside the project folder. Resume did not start.",
        { layout, journal, path: relativePath },
      );
    if (info.size !== record.bytes)
      return inspection(
        "file_modified",
        "A tracked project file changed on disk. Resume did not start, and the changed file was not overwritten.",
        { layout, journal, path: relativePath },
      );
    let buffer: Buffer;
    try {
      buffer = await readFile(target);
    } catch {
      return inspection(
        "journal_unavailable",
        "A tracked project file could not be read, so resume did not start.",
        { layout, journal, path: relativePath },
      );
    }
    if (hash(buffer) !== record.sha256)
      return inspection(
        "file_modified",
        "A tracked project file changed on disk. Resume did not start, and the changed file was not overwritten.",
        { layout, journal, path: relativePath },
      );
  }

  return {
    layout,
    journal,
    status: "available",
    message: null,
    path: null,
    missingFiles,
    missingFileCount,
  };
}

export function emptyProjectRecovery(): ProjectPreparationRecovery {
  return {
    canRetry: false,
    canResume: false,
    canFresh: false,
    settling: false,
    resumeStatus: "not_applicable",
    resumeMessage: null,
    conflictPath: null,
    missingFiles: [],
    missingFileCount: 0,
  };
}

export function recoveryForInspection(input: {
  status: ProjectResumeInspection["status"];
  message: string | null;
  path: string | null;
  missingFiles: string[];
  missingFileCount: number;
  settling: boolean;
  recoverable: boolean;
  attemptsExhausted: boolean;
}): ProjectPreparationRecovery {
  const { recoverable, attemptsExhausted, settling } = input;
  const resumeAvailable = recoverable && !attemptsExhausted && !settling;
  let resumeStatus: ProjectResumeStatus = input.status;
  if (!recoverable) resumeStatus = "not_applicable";
  else if (attemptsExhausted) resumeStatus = "attempts_exhausted";
  else if (settling) resumeStatus = "settling";
  const canRetry = recoverable && !attemptsExhausted && !settling;
  const canFresh = recoverable && !attemptsExhausted && !settling;
  const resumeMessage = !recoverable
    ? null
    : attemptsExhausted
      ? "This challenge reached the maximum number of preparation attempts."
      : settling
        ? "The previous preparation run is still stopping. Recovery actions unlock after it settles."
        : input.status === "available"
          ? null
          : input.message;
  return {
    canRetry,
    canResume: resumeAvailable && input.status === "available",
    canFresh,
    settling,
    resumeStatus,
    resumeMessage,
    conflictPath:
      input.status === "file_modified" ? (input.path ?? null) : null,
    missingFiles: input.status === "available" ? input.missingFiles : [],
    missingFileCount: input.status === "available" ? input.missingFileCount : 0,
  };
}
