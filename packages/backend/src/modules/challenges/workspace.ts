import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
  isSelectableWorkspacePath,
  type ChallengeWorkspace,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { canonicalPath } from "../../shared/storage/canonical-path";
import { workspacesPath } from "../../shared/storage/paths";

export type WorkspaceChallenge = {
  id: string;
  profileId: string;
  number: number;
  title: string;
  topic: string | null;
  problemStatement: string;
  expectedOutcome: string;
  implementationBoundary: string | null;
  implementationMilestones: string[];
  completionCriteria: string[];
  workspacePath: string | null;
};

const markerDirectory = ".grill-me";
const markerName = "workspace.json";
const markerSchema = z.object({
  version: z.literal(1),
  challengeId: z.string().uuid(),
  profileId: z.string().uuid(),
  createdAt: z.string().datetime(),
  starterFile: z.string().max(255).nullable(),
  seededFiles: z.array(z.string().max(255)).max(20).default([]),
});
type WorkspaceMarker = z.infer<typeof markerSchema>;

export function challengeWorkspaceFolderName(
  challenge: Pick<WorkspaceChallenge, "id" | "number" | "title">,
) {
  const slug =
    challenge.title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "challenge";
  const suffix =
    challenge.id
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 8)
      .toLowerCase() || "challenge";
  return `${String(challenge.number).padStart(4, "0")}-${slug}-${suffix}`;
}

export function challengeWorkspacePath(
  root: string,
  challenge: Pick<WorkspaceChallenge, "id" | "profileId" | "number" | "title">,
) {
  return join(
    root,
    "profiles",
    challenge.profileId,
    challengeWorkspaceFolderName(challenge),
  );
}

function list(items: string[]) {
  return items
    .map((item) => "- " + item.replace(/\s+/g, " ").trim())
    .join("\n");
}

function readme(challenge: WorkspaceChallenge, starterFile: string | null) {
  const sections = [
    `# #${challenge.number} ${challenge.title.replace(/\s+/g, " ").trim()}`,
    "## Task\n\n" + challenge.problemStatement.trim(),
    "## Expected outcome\n\n" + challenge.expectedOutcome.trim(),
    "## Requirements\n\n" + list(challenge.completionCriteria),
  ];
  if (challenge.implementationBoundary)
    sections.push(
      "## Implementation boundary\n\n" +
        challenge.implementationBoundary.trim(),
    );
  if (challenge.implementationMilestones.length)
    sections.push(
      "## Implementation milestones\n\n" +
        challenge.implementationMilestones
          .map(
            (item, index) =>
              `${index + 1}. ${item.replace(/\s+/g, " ").trim()}`,
          )
          .join("\n"),
    );
  sections.push(
    [
      "## Workspace",
      "Grill Me created this folder for the challenge. Add code, notes, artifacts, and subfolders here.",
      "Starter files are written once; existing files are never replaced.",
      ...(starterFile ? [`Starter file: \`${starterFile}\``] : []),
    ].join("\n\n"),
  );
  return sections.join("\n\n") + "\n";
}

async function readableDirectory(path: string) {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error("Not a directory");
  await access(path, constants.R_OK | constants.W_OK | constants.X_OK);
}

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function insideRoot(root: string, candidate: string) {
  const relativePath = relative(root, candidate);
  return (
    Boolean(relativePath) &&
    relativePath !== ".." &&
    !relativePath.startsWith(".." + sep) &&
    !isAbsolute(relativePath)
  );
}

function invalidWorkspacePath(message: string, path?: string) {
  return new AppError(
    "WORKSPACE_PATH_INVALID",
    message,
    400,
    false,
    path ? { path } : undefined,
  );
}

async function prepareRoot(path: string) {
  if (!isSelectableWorkspacePath(path))
    throw new AppError(
      "WORKSPACE_ROOT_INVALID",
      "Choose an absolute workspace folder other than the filesystem root.",
      400,
    );
  try {
    await mkdir(resolve(path), { recursive: true, mode: 0o700 });
    const root = await canonicalPath(resolve(path));
    if (root === sep || !isSelectableWorkspacePath(root))
      throw new AppError(
        "WORKSPACE_ROOT_INVALID",
        "Choose a workspace folder other than the filesystem root.",
        400,
      );
    await readableDirectory(root);
    return root;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "WORKSPACE_ROOT_UNAVAILABLE",
      "The challenge workspace root could not be created or used. Check the folder path and permissions in Settings → Advanced.",
      503,
      true,
    );
  }
}

async function prepareDirectory(path: string, recordedPath?: string) {
  const requested = resolve(path);
  if (!isAbsolute(path) || requested === sep)
    throw invalidWorkspacePath(
      "The challenge workspace folder is invalid.",
      recordedPath,
    );
  try {
    await mkdir(requested, { recursive: true, mode: 0o700 });
    const directory = await canonicalPath(requested);
    if (directory === sep)
      throw invalidWorkspacePath(
        "The challenge workspace folder is invalid.",
        recordedPath,
      );
    await readableDirectory(directory);
    return directory;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "WORKSPACE_UNAVAILABLE",
      recordedPath
        ? "The recorded challenge workspace folder is unavailable. Check the drive and permissions, or use the current workspace root."
        : "The challenge workspace folder cannot be opened. Check the folder path and permissions.",
      503,
      true,
      recordedPath ? { path: recordedPath } : undefined,
    );
  }
}

async function prepareScopedDirectory(root: string, path: string) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw invalidWorkspacePath(
        "The challenge workspace folder must stay inside the workspace root.",
      );
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (fsCode(error) !== "ENOENT") throw error;
  }
  await mkdir(path, { recursive: true, mode: 0o700 });
  const directory = await canonicalPath(path);
  if (!insideRoot(root, directory))
    throw invalidWorkspacePath(
      "The challenge workspace folder must stay inside the workspace root.",
    );
  return directory;
}

async function createDeterministicWorkspace(
  root: string,
  challenge: WorkspaceChallenge,
) {
  try {
    const profiles = await prepareScopedDirectory(root, join(root, "profiles"));
    const profile = await prepareScopedDirectory(
      root,
      join(profiles, challenge.profileId),
    );
    const path = join(profile, challengeWorkspaceFolderName(challenge));
    if (path.length > 4096)
      throw new AppError(
        "WORKSPACE_PATH_INVALID",
        "The challenge workspace path is too long. Choose a shorter workspace folder in Settings → Advanced.",
        400,
      );
    if (!insideRoot(root, path))
      throw invalidWorkspacePath(
        "The challenge workspace folder must stay inside the workspace root.",
      );
    const directory = await prepareDirectory(path);
    if (!insideRoot(root, directory))
      throw invalidWorkspacePath(
        "The challenge workspace folder must stay inside the workspace root.",
      );
    return directory;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "WORKSPACE_UNAVAILABLE",
      "The challenge workspace folder cannot be opened. Check the workspace root and folder permissions.",
      503,
      true,
    );
  }
}

async function resolveStoredWorkspace(
  challenge: WorkspaceChallenge,
  rootInput: string,
) {
  const stored = challenge.workspacePath!;
  if (!isAbsolute(stored) || resolve(stored) === sep)
    throw invalidWorkspacePath(
      "The recorded challenge workspace folder is invalid.",
      stored,
    );
  try {
    await stat(stored);
  } catch (error) {
    if (fsCode(error) !== "ENOENT")
      throw new AppError(
        "WORKSPACE_UNAVAILABLE",
        "The recorded challenge workspace folder is unavailable. Check the drive and permissions, or use the current workspace root.",
        503,
        true,
        { path: stored, code: fsCode(error) ?? null },
      );
    // A copied or restored data root no longer has the recorded absolute path.
    // Prefer the matching challenge folder under the current root, and never
    // recreate or move files at the old location.
    const root = await prepareRoot(rootInput);
    return createDeterministicWorkspace(root, challenge);
  }
  return prepareDirectory(stored, stored);
}

function metadataInvalid(message: string) {
  return invalidWorkspacePath(message);
}

async function existingMetadataDirectory(path: string) {
  const root = await canonicalPath(path);
  const directory = join(root, markerDirectory);
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (fsCode(error) === "ENOENT") return null;
    throw metadataInvalid(
      "The challenge workspace metadata cannot be inspected. Check its permissions.",
    );
  }
  if (info.isSymbolicLink() || !info.isDirectory())
    throw metadataInvalid(
      "The challenge workspace metadata path must be a real folder, not a symbolic link or file.",
    );
  const canonical = await canonicalPath(directory);
  if (!insideRoot(root, canonical))
    throw metadataInvalid(
      "The challenge workspace metadata must stay inside the workspace folder.",
    );
  return { root, directory: canonical };
}

async function ensureMetadataDirectory(path: string) {
  const existing = await existingMetadataDirectory(path);
  if (existing) return existing;
  const root = await canonicalPath(path);
  const directory = join(root, markerDirectory);
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (fsCode(error) !== "EEXIST") throw error;
  }
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory())
    throw metadataInvalid(
      "The challenge workspace metadata path must be a real folder, not a symbolic link or file.",
    );
  const canonical = await canonicalPath(directory);
  if (!insideRoot(root, canonical))
    throw metadataInvalid(
      "The challenge workspace metadata must stay inside the workspace folder.",
    );
  return { root, directory: canonical };
}

async function readMarker(path: string, challenge: WorkspaceChallenge) {
  try {
    const metadata = await existingMetadataDirectory(path);
    if (!metadata) return null;
    const markerPath = join(metadata.directory, markerName);
    const info = await lstat(markerPath);
    if (info.isSymbolicLink() || !info.isFile())
      throw metadataInvalid(
        "The challenge workspace marker must be a regular file, not a symbolic link or folder.",
      );
    if (info.size > 16 * 1024) return null;
    const canonical = await canonicalPath(markerPath);
    if (!insideRoot(metadata.root, canonical))
      throw metadataInvalid(
        "The challenge workspace marker must stay inside the workspace folder.",
      );
    const parsed = markerSchema.safeParse(
      JSON.parse(await readFile(canonical, "utf8")),
    );
    if (
      parsed.success &&
      parsed.data.challengeId === challenge.id &&
      parsed.data.profileId === challenge.profileId
    )
      return parsed.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (fsCode(error) === "ENOENT") return null;
    /* Corrupt or unreadable marker; recreate it below. */
  }
  return null;
}

async function writeMarker(path: string, marker: WorkspaceMarker) {
  const metadata = await ensureMetadataDirectory(path);
  const destination = join(metadata.directory, markerName);
  let existing;
  try {
    existing = await lstat(destination);
  } catch (error) {
    if (fsCode(error) !== "ENOENT") throw error;
  }
  if (existing && (existing.isSymbolicLink() || !existing.isFile()))
    throw metadataInvalid(
      "The challenge workspace marker must be a regular file, not a symbolic link or folder.",
    );
  const temporary = join(metadata.directory, `.${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(marker, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeMissing(path: string, content: string) {
  try {
    await writeFile(path, content, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "EISDIR") return false;
    throw error;
  }
}

export async function ensureChallengeWorkspace(input: {
  challenge: WorkspaceChallenge;
  root: string;
  /** Explicit recovery: ignore the recorded folder and use the current root. */
  relink?: boolean;
}): Promise<ChallengeWorkspace> {
  const { challenge } = input;
  let path: string;
  if (challenge.workspacePath && !input.relink) {
    path = await resolveStoredWorkspace(challenge, input.root);
  } else {
    const root = await prepareRoot(input.root);
    path = await createDeterministicWorkspace(root, challenge);
  }

  const existingMarker = await readMarker(path, challenge);
  const initialized = !existingMarker;
  const starterFile = existingMarker?.starterFile ?? null;
  if (!existingMarker) {
    const seededFiles: string[] = [];
    if (
      await writeMissing(
        join(path, "README.md"),
        readme(challenge, starterFile),
      )
    )
      seededFiles.push("README.md");
    await writeMarker(path, {
      version: 1,
      challengeId: challenge.id,
      profileId: challenge.profileId,
      createdAt: new Date().toISOString(),
      starterFile,
      seededFiles,
    });
  }

  return { path, initialized, starterFile };
}

export function createChallengeWorkspaceService(
  root: () => string = workspacesPath,
) {
  const pending = new Map<string, Promise<ChallengeWorkspace>>();
  return {
    ensure(challenge: WorkspaceChallenge, options: { relink?: boolean } = {}) {
      const key = `${challenge.id}:${options.relink ? "relink" : "ensure"}`;
      const running = pending.get(key);
      if (running) return running;
      const task = ensureChallengeWorkspace({
        challenge,
        root: root(),
        relink: options.relink,
      }).finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    },
    root,
  };
}

export type ChallengeWorkspaceService = ReturnType<
  typeof createChallengeWorkspaceService
>;
