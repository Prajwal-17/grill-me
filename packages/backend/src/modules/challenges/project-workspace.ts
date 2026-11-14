import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { canonicalPath } from "../../shared/storage/canonical-path";
import { excludedPath } from "../projects/paths";

export const projectMetadataDirectory = ".grill-me";
export const projectArtifactsDirectory = "artifacts";
export const projectJournalDirectory = "projects";
export const projectDefaultDirectory = "project";
export const projectSourceDirectories = ["src", "migrations", "test"] as const;
export const projectDocumentFiles = [
  "package.json",
  "README.md",
  "CHALLENGE.md",
] as const;
export const maxProjectAttempts = 99;
export const maxProjectRelativePathLength = 512;

const maxJournalBytes = 1024 * 1024;
const maxJournalFiles = 10_000;
const maxJournalFileBytes = 64 * 1024 * 1024;
const extraProtectedDirectories = new Set([".hg", ".svn", ".gnupg"]);
const extraSecretFiles =
  /^(?:secrets\.json|\.envrc|\.npmrc|\.netrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$/i;

export type ProjectLayout = {
  /** The challenge workspace folder that owns the project and artifacts. */
  workspaceRoot: string;
  /** The project folder name, such as `project` or `project-2`. */
  projectDirectory: string;
  /** The only folder the project file tools may access. */
  projectRoot: string;
  /** Challenge-owned artifacts shared by preparation attempts. */
  artifactsRoot: string;
  /** App-only metadata, kept outside the project tools root. */
  metadataRoot: string;
  /** Per-attempt generated-file journal. */
  journalPath: string;
};

export type ProjectJournalLocation = Pick<
  ProjectLayout,
  "projectDirectory" | "metadataRoot" | "journalPath"
>;

export type ProjectFileRecord = {
  sha256: string;
  bytes: number;
  writtenAt: string;
};

export type ProjectJournal = {
  version: 1;
  projectDirectory: string;
  createdAt: string;
  updatedAt: string;
  /** Generated files keyed by forward-slash paths relative to the project root. */
  files: Record<string, ProjectFileRecord>;
};

const sha256Pattern = /^[a-f0-9]{64}$/;
const fileRecordSchema = z.object({
  sha256: z.string().regex(sha256Pattern),
  bytes: z.number().int().nonnegative(),
  writtenAt: z.string().datetime(),
});
const journalSchema = z.object({
  version: z.literal(1),
  projectDirectory: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  files: z.record(z.string(), fileRecordSchema),
});

function invalidLayout(message: string) {
  return new AppError("PROJECT_LAYOUT_INVALID", message, 400);
}

function invalidPath(message: string, path?: string) {
  return new AppError(
    "PROJECT_PATH_INVALID",
    message,
    400,
    false,
    path === undefined ? undefined : { path },
  );
}

function metadataInvalid(message: string) {
  return new AppError("PROJECT_METADATA_INVALID", message, 409, false);
}

function metadataUnavailable(message: string) {
  return new AppError("PROJECT_METADATA_UNAVAILABLE", message, 503, true);
}

function rootUnavailable(message: string) {
  return new AppError("PROJECT_ROOT_UNAVAILABLE", message, 503, true);
}

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
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

/**
 * Validate a project-relative path before any filesystem access. Paths are
 * forward-slash only, cannot escape the project root, and cannot address
 * credential files, dependency output, VCS data, or Grill Me metadata.
 */
export function projectRelativePath(path: string) {
  if (typeof path !== "string" || !path.trim())
    throw invalidPath("Enter a file path inside the challenge project.");
  if (path.length > maxProjectRelativePathLength)
    throw invalidPath("That project path is too long.");
  if (path.includes("\0"))
    throw invalidPath("Project paths cannot contain NUL.");
  if (path.includes("\\"))
    throw invalidPath("Use forward slashes in project paths.");
  if (isAbsolute(path) || /^[a-zA-Z]:/.test(path))
    throw invalidPath("Use a path relative to the challenge project.");
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw invalidPath("Project paths cannot contain empty, `.` or `..` parts.");
  if (parts.some((part) => Buffer.byteLength(part) > 255))
    throw invalidPath("A project file name is too long.");
  if (
    parts.some(
      (part) =>
        part.toLowerCase() === projectMetadataDirectory ||
        extraProtectedDirectories.has(part.toLowerCase()) ||
        extraSecretFiles.test(part),
    )
  )
    throw invalidPath("That path is reserved for app metadata or credentials.");
  if (excludedPath(path.toLowerCase()))
    throw invalidPath(
      "That path is reserved for credentials or generated dependency output.",
    );
  return path;
}

export function projectDirectoryName(attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > maxProjectAttempts)
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      `Project attempts must be between 1 and ${maxProjectAttempts}.`,
      400,
    );
  return attempt === 1
    ? projectDefaultDirectory
    : `${projectDefaultDirectory}-${attempt}`;
}

export function projectAttemptNumber(directory: string) {
  const match = /^project(?:-([1-9][0-9]*))?$/.exec(directory);
  if (!match) return null;
  const attempt = match[1] ? Number(match[1]) : 1;
  return attempt <= maxProjectAttempts ? attempt : null;
}

export function projectLayout(root: string, attempt = 1): ProjectLayout {
  if (
    typeof root !== "string" ||
    !root.trim() ||
    root.includes("\0") ||
    !isAbsolute(root)
  )
    throw invalidLayout(
      "The challenge workspace root must be an absolute path.",
    );
  const workspaceRoot = resolve(root);
  if (workspaceRoot === sep)
    throw invalidLayout(
      "The challenge workspace root cannot be the filesystem root.",
    );
  if (workspaceRoot.length > 4096)
    throw invalidLayout("The challenge workspace path is too long.");
  const projectDirectory = projectDirectoryName(attempt);
  const metadataRoot = join(workspaceRoot, projectMetadataDirectory);
  return {
    workspaceRoot,
    projectDirectory,
    projectRoot: join(workspaceRoot, projectDirectory),
    artifactsRoot: join(workspaceRoot, projectArtifactsDirectory),
    metadataRoot,
    journalPath: join(
      metadataRoot,
      projectJournalDirectory,
      `${projectDirectory}.json`,
    ),
  };
}

async function prepareWorkspaceRoot(root: string, create: boolean) {
  if (
    typeof root !== "string" ||
    !root.trim() ||
    root.includes("\0") ||
    !isAbsolute(root)
  )
    throw invalidLayout(
      "The challenge workspace root must be an absolute path.",
    );
  const requested = resolve(root);
  if (requested === sep || requested.length > 4096)
    throw invalidLayout(
      "Choose a challenge workspace folder other than the filesystem root.",
    );
  try {
    if (create) await mkdir(requested, { recursive: true, mode: 0o700 });
    const info = await lstat(requested);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw invalidLayout("The challenge workspace folder is invalid.");
    const canonical = await canonicalPath(requested);
    if (canonical === sep)
      throw invalidLayout(
        "Choose a challenge workspace folder other than the filesystem root.",
      );
    await access(
      canonical,
      constants.R_OK | constants.X_OK | (create ? constants.W_OK : 0),
    );
    return canonical;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (fsCode(error) === "ENOENT")
      throw new AppError(
        "PROJECT_NOT_FOUND",
        "The challenge workspace folder does not exist.",
        404,
      );
    throw rootUnavailable(
      "The challenge workspace folder is unavailable. Check the drive and folder permissions.",
    );
  }
}

async function ensureDirectory(path: string, label: string) {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw invalidLayout(`${label} must be a real folder.`);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw metadataUnavailable(`${label} could not be created or used.`);
  }
}

async function ensureMetadataDirectory(
  location: ProjectJournalLocation,
  create = true,
) {
  if (
    !isAbsolute(location.metadataRoot) ||
    !isAbsolute(location.journalPath) ||
    location.metadataRoot === sep
  )
    throw invalidLayout("Project metadata paths must be absolute.");
  if (!inside(location.metadataRoot, location.journalPath))
    throw invalidLayout("The project journal must stay inside app metadata.");
  const journalDirectory = dirname(location.journalPath);
  if (create) {
    await ensureDirectory(location.metadataRoot, "Project metadata");
    await ensureDirectory(journalDirectory, "Project journal folder");
  } else {
    const metadata = await lstat(location.metadataRoot).catch((error) => {
      if (fsCode(error) === "ENOENT") return null;
      throw metadataUnavailable("Project metadata could not be read.");
    });
    if (!metadata) return false;
    if (metadata.isSymbolicLink() || !metadata.isDirectory())
      throw metadataInvalid("Project metadata must be a real folder.");
    const directory = await lstat(journalDirectory).catch((error) => {
      if (fsCode(error) === "ENOENT") return null;
      throw metadataUnavailable(
        "The project journal folder could not be read.",
      );
    });
    if (!directory) return false;
    if (directory.isSymbolicLink() || !directory.isDirectory())
      throw metadataInvalid(
        "The project journal folder must be a real folder.",
      );
  }
  try {
    const metadata = await canonicalPath(location.metadataRoot);
    const directory = await canonicalPath(journalDirectory);
    if (directory !== metadata && !inside(metadata, directory))
      throw invalidLayout("The project journal must stay inside app metadata.");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw metadataUnavailable("Project metadata could not be resolved.");
  }
  return true;
}

export function emptyProjectJournal(
  projectDirectory: string,
  at = new Date(),
): ProjectJournal {
  if (!projectAttemptNumber(projectDirectory))
    throw invalidLayout("The project folder name is invalid.");
  const timestamp = at.toISOString();
  return {
    version: 1,
    projectDirectory,
    createdAt: timestamp,
    updatedAt: timestamp,
    files: {},
  };
}

export function projectFileRecord(
  content: string | Uint8Array,
  at = new Date(),
): ProjectFileRecord {
  const bytes =
    typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    writtenAt: at.toISOString(),
  };
}

export function withGeneratedFile(
  journal: ProjectJournal,
  path: string,
  record: ProjectFileRecord,
): ProjectJournal {
  const relativePath = projectRelativePath(path);
  return {
    ...journal,
    updatedAt: record.writtenAt,
    files: { ...journal.files, [relativePath]: record },
  };
}

export function withoutGeneratedFile(
  journal: ProjectJournal,
  path: string,
): ProjectJournal {
  const relativePath = projectRelativePath(path);
  const files = { ...journal.files };
  delete files[relativePath];
  return { ...journal, files };
}

export function validateProjectJournal(
  value: unknown,
  projectDirectory: string,
): ProjectJournal {
  const parsed = journalSchema.safeParse(value);
  if (!parsed.success)
    throw metadataInvalid(
      "The project metadata journal is unreadable. Stop preparation and inspect the project folder.",
    );
  const journal = parsed.data;
  if (journal.projectDirectory !== projectDirectory)
    throw metadataInvalid(
      "The project metadata journal belongs to another project folder.",
    );
  const paths = Object.keys(journal.files);
  if (paths.length > maxJournalFiles)
    throw metadataInvalid("The project metadata journal is too large.");
  for (const path of paths) {
    try {
      projectRelativePath(path);
    } catch {
      throw metadataInvalid(
        "The project metadata journal contains an unsafe file path.",
      );
    }
    if (journal.files[path]!.bytes > maxJournalFileBytes)
      throw metadataInvalid("The project metadata journal is too large.");
  }
  return journal;
}

export async function readProjectJournal(
  location: ProjectJournalLocation,
): Promise<ProjectJournal | null> {
  if (!(await ensureMetadataDirectory(location, false))) return null;
  let journal;
  try {
    journal = await lstat(location.journalPath);
  } catch (error) {
    if (fsCode(error) === "ENOENT") return null;
    throw metadataUnavailable("The project journal could not be read.");
  }
  if (journal.isSymbolicLink() || !journal.isFile())
    throw metadataInvalid("The project journal must be a real file.");
  if (journal.size > maxJournalBytes)
    throw metadataInvalid("The project journal is too large.");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(location.journalPath, "utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (fsCode(error) === "ENOENT")
      throw metadataInvalid(
        "The project journal disappeared while it was read.",
      );
    throw metadataInvalid(
      "The project journal is corrupt. Stop preparation and inspect the project folder.",
    );
  }
  return validateProjectJournal(value, location.projectDirectory);
}

export async function writeProjectJournal(
  location: ProjectJournalLocation,
  journal: ProjectJournal,
) {
  const value = validateProjectJournal(journal, location.projectDirectory);
  await ensureMetadataDirectory(location);
  const temporary = join(
    dirname(location.journalPath),
    `.${basename(location.journalPath)}.${crypto.randomUUID()}.tmp`,
  );
  try {
    const existing = await lstat(location.journalPath).catch(() => null);
    if (existing && (existing.isSymbolicLink() || !existing.isFile()))
      throw metadataInvalid("The project journal must be a real file.");
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, location.journalPath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (error instanceof AppError) throw error;
    throw metadataUnavailable(
      "The project journal could not be saved, so preparation stopped before changing project files.",
    );
  }
}

export async function deleteProjectJournal(location: ProjectJournalLocation) {
  if (!(await ensureMetadataDirectory(location, false))) return;
  let journal;
  try {
    journal = await lstat(location.journalPath);
  } catch (error) {
    if (fsCode(error) === "ENOENT") return;
    throw metadataUnavailable("The project journal could not be removed.");
  }
  if (journal.isSymbolicLink() || !journal.isFile())
    throw metadataInvalid("The project journal must be a real file.");
  try {
    await rm(location.journalPath);
  } catch {
    throw metadataUnavailable(
      "The project journal could not be restored after a failed write.",
    );
  }
}

async function latestProjectAttempt(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  let latest = 0;
  for (const entry of entries) {
    const attempt = projectAttemptNumber(entry.name);
    if (attempt && attempt > latest) latest = attempt;
  }
  return latest || null;
}

export async function ensureProjectWorkspaceDirectories(layout: ProjectLayout) {
  let info;
  try {
    info = await lstat(layout.projectRoot);
  } catch (error) {
    if (fsCode(error) === "ENOENT")
      throw rootUnavailable("The challenge project folder does not exist.");
    throw rootUnavailable("The challenge project folder is unavailable.");
  }
  if (info.isSymbolicLink() || !info.isDirectory())
    throw invalidLayout("The challenge project folder is invalid.");
  for (const directory of projectSourceDirectories)
    await ensureDirectory(
      join(layout.projectRoot, directory),
      `Project ${directory}`,
    );
  await ensureDirectory(layout.artifactsRoot, "Project artifacts");
  await ensureMetadataDirectory(layout);
}

/**
 * Create a fresh preparation project. The first attempt is `project`; later
 * attempts use `project-2`, `project-3`, and so on. Existing attempts and their
 * files are never reused or removed.
 */
export async function createProjectWorkspace(input: {
  root: string;
  now?: () => Date;
}): Promise<{ layout: ProjectLayout; journal: ProjectJournal }> {
  const root = await prepareWorkspaceRoot(input.root, true);
  const start = ((await latestProjectAttempt(root)) ?? 0) + 1;
  for (let attempt = start; attempt <= maxProjectAttempts; attempt++) {
    const layout = projectLayout(root, attempt);
    try {
      await mkdir(layout.projectRoot, { mode: 0o700 });
    } catch (error) {
      if (fsCode(error) === "EEXIST") continue;
      throw rootUnavailable(
        "The challenge project folder could not be created.",
      );
    }
    await ensureProjectWorkspaceDirectories(layout);
    const journal = emptyProjectJournal(
      layout.projectDirectory,
      input.now?.() ?? new Date(),
    );
    await writeProjectJournal(layout, journal);
    return { layout, journal };
  }
  throw new AppError(
    "PROJECT_ATTEMPTS_EXHAUSTED",
    "This challenge already has the maximum number of preparation attempts.",
    409,
  );
}

export async function openProjectWorkspace(input: {
  root: string;
  projectDirectory?: string;
}): Promise<{ layout: ProjectLayout; journal: ProjectJournal | null }> {
  const root = await prepareWorkspaceRoot(input.root, false);
  let attempt: number | null;
  if (input.projectDirectory === undefined) {
    attempt = await latestProjectAttempt(root);
    if (!attempt)
      throw new AppError(
        "PROJECT_NOT_FOUND",
        "This challenge does not have a preparation project yet.",
        404,
      );
  } else {
    attempt = projectAttemptNumber(input.projectDirectory);
    if (!attempt) throw invalidLayout("The project folder name is invalid.");
  }
  const layout = projectLayout(root, attempt);
  let info;
  try {
    info = await lstat(layout.projectRoot);
  } catch (error) {
    if (fsCode(error) === "ENOENT")
      throw new AppError(
        "PROJECT_NOT_FOUND",
        "This challenge project folder does not exist.",
        404,
      );
    throw rootUnavailable("The challenge project folder is unavailable.");
  }
  if (info.isSymbolicLink() || !info.isDirectory())
    throw invalidLayout("The challenge project folder is invalid.");
  return { layout, journal: await readProjectJournal(layout) };
}
