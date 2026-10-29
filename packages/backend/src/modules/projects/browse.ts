import { readdir, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { AppError } from "../../shared/errors/app-error";
import { configuredProjectsRoot, isWithinProjectsRoot } from "./paths";

export async function browseFolders(path?: string) {
  try {
    const configuredRoot = configuredProjectsRoot();
    const projectsRoot = configuredRoot ? await realpath(configuredRoot) : null;
    const current = await realpath(
      path ||
        projectsRoot ||
        (existsSync("/projects") ? "/projects" : homedir()),
    );
    if (projectsRoot && !isWithinProjectsRoot(projectsRoot, current))
      throw new AppError(
        "FOLDER_OUTSIDE_PROJECTS_ROOT",
        `Choose a folder inside ${projectsRoot}.`,
        400,
      );
    const entries = await readdir(current, { withFileTypes: true });
    const parent = dirname(current);
    return {
      path: current,
      parent: parent === current || current === projectsRoot ? null : parent,
      folders: entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ name: e.name, path: join(current, e.name) })),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "FOLDER_UNAVAILABLE",
      "This folder cannot be opened. Choose a folder inside the configured projects directory.",
      400,
    );
  }
}
