import { constants } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type {
  ProjectFileContent,
  ProjectFileEntry,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { canonicalPath } from "../../shared/storage/canonical-path";
import { projectRelativePath, type ProjectLayout } from "./project-workspace";

export const maxProjectFileEntries = 2_000;
export const maxProjectFilePreviewBytes = 2 * 1024 * 1024;
const maxProjectFileDepth = 12;

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

function invalidPath(message: string) {
  return new AppError("PROJECT_PATH_INVALID", message, 400);
}

function unavailable(message: string) {
  return new AppError("PROJECT_FILES_UNAVAILABLE", message, 503, true);
}

async function readableProjectRoot(layout: ProjectLayout) {
  let info;
  try {
    info = await lstat(layout.projectRoot);
  } catch (error) {
    if (fsCode(error) === "ENOENT")
      throw new AppError(
        "PROJECT_NOT_FOUND",
        "This challenge does not have a prepared project folder yet.",
        404,
      );
    throw unavailable("The challenge project folder is unavailable.");
  }
  if (info.isSymbolicLink() || !info.isDirectory())
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "The challenge project folder must be a real folder.",
      400,
    );
  let root;
  try {
    root = await canonicalPath(layout.projectRoot);
    await access(root, constants.R_OK | constants.X_OK);
  } catch (error) {
    if (fsCode(error) === "ENOENT")
      throw new AppError(
        "PROJECT_NOT_FOUND",
        "This challenge does not have a prepared project folder yet.",
        404,
      );
    throw unavailable("The challenge project folder cannot be read.");
  }
  if (root === sep || !inside(layout.workspaceRoot, root))
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "The challenge project folder must stay inside the challenge workspace.",
      400,
    );
  return root;
}

/** List regular files under the current preparation project without following links. */
export async function listProjectFiles(layout: ProjectLayout): Promise<{
  files: ProjectFileEntry[];
  truncated: boolean;
}> {
  const root = await readableProjectRoot(layout);
  const files: ProjectFileEntry[] = [];
  let truncated = false;

  const walk = async (directory: string, depth: number) => {
    if (truncated) return;
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      throw unavailable("A project folder cannot be read.");
    }
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (files.length >= maxProjectFileEntries) {
        truncated = true;
        return;
      }
      if (child.isSymbolicLink()) continue;
      const path = join(directory, child.name);
      const display = relative(root, path).split(sep).join("/");
      try {
        projectRelativePath(display);
      } catch {
        continue;
      }
      if (child.isDirectory()) {
        if (depth < maxProjectFileDepth) await walk(path, depth + 1);
        else truncated = true;
        continue;
      }
      if (!child.isFile()) continue;
      let info;
      try {
        info = await lstat(path);
      } catch {
        continue;
      }
      files.push({ path: display, bytes: info.size });
    }
  };

  await walk(root, 0);
  return { files, truncated };
}

/** Read one validated text file from the current preparation project. */
export async function readProjectFile(
  layout: ProjectLayout,
  requestedPath: string,
): Promise<ProjectFileContent> {
  const path = projectRelativePath(requestedPath);
  const root = await readableProjectRoot(layout);
  let cursor = root;
  for (const [index, part] of path.split("/").entries()) {
    cursor = join(cursor, part);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (fsCode(error) === "ENOENT")
        throw new AppError(
          "PROJECT_FILE_NOT_FOUND",
          "That project file no longer exists.",
          404,
        );
      throw unavailable("That project file cannot be read.");
    }
    if (info.isSymbolicLink())
      throw invalidPath("Project files do not follow symbolic links.");
    if (index < path.split("/").length - 1 && !info.isDirectory())
      throw invalidPath("A parent of that project file is not a folder.");
  }
  let canonical;
  try {
    canonical = await canonicalPath(cursor);
  } catch {
    throw new AppError(
      "PROJECT_FILE_NOT_FOUND",
      "That project file no longer exists.",
      404,
    );
  }
  if (!inside(root, canonical))
    throw invalidPath("Project files must stay inside the project folder.");
  const info = await lstat(canonical);
  if (!info.isFile()) throw invalidPath("That project path is not a file.");
  if (info.size > maxProjectFilePreviewBytes)
    return {
      path,
      bytes: info.size,
      content: null,
      binary: false,
      tooLarge: true,
    };
  let bytes;
  try {
    bytes = await readFile(canonical);
  } catch {
    throw unavailable("That project file cannot be read.");
  }
  if (bytes.subarray(0, 8_000).includes(0))
    return {
      path,
      bytes: bytes.length,
      content: null,
      binary: true,
      tooLarge: false,
    };
  try {
    return {
      path,
      bytes: bytes.length,
      content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      binary: false,
      tooLarge: false,
    };
  } catch {
    return {
      path,
      bytes: bytes.length,
      content: null,
      binary: true,
      tooLarge: false,
    };
  }
}
