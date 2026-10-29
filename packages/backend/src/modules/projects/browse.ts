import { readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { AppError } from "../../shared/errors/app-error";

export async function browseFolders(path?: string) {
  try {
    const requested = path?.trim() || homedir();
    if (!isAbsolute(requested))
      throw new AppError(
        "ABSOLUTE_PATH_REQUIRED",
        "Enter an absolute local folder path.",
        400,
      );
    const current = await realpath(requested);
    const entries = await readdir(current, { withFileTypes: true });
    const parent = dirname(current);
    return {
      path: current,
      parent: parent === current ? null : parent,
      folders: entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ name: e.name, path: join(current, e.name) })),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "FOLDER_UNAVAILABLE",
      "This folder cannot be opened. Check that it exists and you have permission to read it.",
      400,
    );
  }
}
