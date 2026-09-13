import { readdir, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { AppError } from "../../shared/errors/app-error";
export async function browseFolders(path?: string) {
  try {
    const current = await realpath(
      path || (existsSync("/projects") ? "/projects" : homedir()),
    );
    const entries = await readdir(current, { withFileTypes: true });
    return {
      path: current,
      parent: dirname(current) === current ? null : dirname(current),
      folders: entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ name: e.name, path: join(current, e.name) })),
    };
  } catch {
    throw new AppError(
      "FOLDER_UNAVAILABLE",
      "This folder cannot be opened by the backend. Choose another folder or upload it from your computer.",
      400,
    );
  }
}
