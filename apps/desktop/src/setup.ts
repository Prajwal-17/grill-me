import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import type { DesktopChannel } from "./identity";

/** Stable, channel-specific bootstrap record beside Electron's own config. */
export const SETUP_CONFIG_FILE = "desktop-setup.json";
const MAX_PATH = 4096;
const MAX_CONFIG_BYTES = 64 * 1024;
const existingDataNames = [
  "grill-me.sqlite",
  "settings.sqlite",
  "backend.env",
  "secrets.json",
  "workspaces",
  "uploads",
  "submissions",
  "evaluations",
  "providers",
];

export class SetupError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SetupError";
  }
}

/** Absolute data or workspace roots cannot be the filesystem root. */
export function isSelectableLocalRoot(value: string) {
  if (
    !value ||
    value.length > MAX_PATH ||
    !isAbsolute(value) ||
    /[\0\r\n]/.test(value)
  )
    return false;
  const absolute = resolve(value);
  return absolute !== sep && absolute.length <= MAX_PATH;
}

/** A parent may be the filesystem root; the app creates a named child inside it. */
export function isSelectableFolderParent(value: string) {
  return (
    Boolean(value) &&
    value.length <= MAX_PATH &&
    isAbsolute(value) &&
    !/[\0\r\n]/.test(value)
  );
}

export const setupConfigSchema = z
  .object({
    version: z.literal(1),
    channel: z.enum(["development", "production"]),
    completedAt: z.string().datetime(),
    dataRoot: z
      .string()
      .max(MAX_PATH)
      .refine(isSelectableLocalRoot, "Use an absolute app data folder."),
    workspaceRoot: z
      .string()
      .max(MAX_PATH)
      .refine(isSelectableLocalRoot, "Use an absolute workspace folder."),
  })
  .strict();
export type SetupConfig = z.infer<typeof setupConfigSchema>;

export type SetupChoice = {
  dataParent: string | null;
  workspaceParent: string | null;
};
export type SetupDefaults = { dataRoot: string; workspaceRoot: string };
export type SetupReady = {
  kind: "ready";
  dataRoot: string;
  workspaceRoot: string;
  existing: boolean;
};
export type SetupRequired = {
  kind: "setup";
  defaults: SetupDefaults;
  error: string | null;
  saved: { dataRoot: string; workspaceRoot: string } | null;
};
export type StartupResolution = SetupReady | SetupRequired;

export type StartupOptions = {
  configRoot: string;
  channel: DesktopChannel;
  dataFolderName: string;
  workspaceFolderName: string;
};
export type SetupSelection = { dataRoot: string; workspaceRoot: string };

export function setupConfigPath(configRoot: string) {
  return join(resolve(configRoot), SETUP_CONFIG_FILE);
}

export function defaultWorkspaceRoot(dataRoot: string) {
  return join(dataRoot, "workspaces");
}

export type StoredSetup = {
  config: SetupConfig | null;
  found: boolean;
  error: string | null;
};

export async function readSetupConfig(
  configRoot: string,
  channel: DesktopChannel,
): Promise<StoredSetup> {
  let text: string;
  try {
    text = await readFile(setupConfigPath(configRoot), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { config: null, found: false, error: null };
    return {
      config: null,
      found: true,
      error: "The saved setup could not be read.",
    };
  }
  if (Buffer.byteLength(text) > MAX_CONFIG_BYTES)
    return {
      config: null,
      found: true,
      error: "The saved setup could not be read.",
    };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      config: null,
      found: true,
      error: "The saved setup could not be read.",
    };
  }
  const parsed = setupConfigSchema.safeParse(raw);
  if (!parsed.success)
    return {
      config: null,
      found: true,
      error: "The saved setup could not be read.",
    };
  if (parsed.data.channel !== channel)
    return {
      config: null,
      found: true,
      error: "The saved setup belongs to a different edition.",
    };
  return { config: parsed.data, found: true, error: null };
}

export async function writeSetupConfig(
  configRoot: string,
  config: SetupConfig,
) {
  const parsed = setupConfigSchema.parse(config);
  const root = resolve(configRoot);
  const path = setupConfigPath(root);
  const temporary = join(
    root,
    `.${SETUP_CONFIG_FILE}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify(parsed, null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw new SetupError(
      "The setup choices could not be saved. Check the app configuration folder permissions and try again.",
      { cause: error },
    );
  }
}

export async function hasExistingData(root: string) {
  for (const name of existingDataNames) {
    try {
      await lstat(join(resolve(root), name));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      return true;
    }
  }
  return false;
}

async function readableDirectory(path: string) {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error("Not a directory");
  await access(path, constants.R_OK | constants.W_OK | constants.X_OK);
  return path;
}

async function prepareExistingRoot(path: string) {
  if (!isSelectableLocalRoot(path))
    throw new SetupError("The saved app data folder is not a valid location.");
  try {
    const canonical = await realpath(resolve(path));
    if (!isSelectableLocalRoot(canonical))
      throw new SetupError(
        "The saved app data folder is not a valid location.",
      );
    return await readableDirectory(canonical);
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError(
      "The saved app data folder is unavailable. Reconnect it or choose another folder. Existing data stays where it is.",
      { cause: error },
    );
  }
}

async function prepareDefaultDataRoot(configRoot: string) {
  try {
    const target = resolve(configRoot);
    await mkdir(target, { recursive: true, mode: 0o700 });
    const canonical = await realpath(target);
    if (!isSelectableLocalRoot(canonical))
      throw new SetupError("The default app data folder is unavailable.");
    return await readableDirectory(canonical);
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError(
      "The default app data folder is unavailable. Choose another folder and check its permissions.",
      { cause: error },
    );
  }
}

async function prepareDefaultWorkspaceRoot(dataRoot: string) {
  try {
    const target = defaultWorkspaceRoot(dataRoot);
    await mkdir(target, { recursive: true, mode: 0o700 });
    const canonical = await realpath(target);
    if (!isSelectableLocalRoot(canonical))
      throw new SetupError("The default workspace folder is unavailable.");
    return await readableDirectory(canonical);
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError(
      "The challenge workspace folder could not be created. Choose another folder and check its permissions.",
      { cause: error },
    );
  }
}

export function appOwnedFolder(parent: string, name: string) {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.length > 128 ||
    /[/\\\0\r\n]/.test(name)
  )
    throw new SetupError("The app folder name is invalid.");
  const selected = resolve(parent);
  const target = join(selected, name);
  if (!isSelectableLocalRoot(target))
    throw new SetupError("Choose a different parent folder for Grill Me.");
  return target;
}

export async function createAppOwnedRoot(parent: string, name: string) {
  if (!isSelectableFolderParent(parent))
    throw new SetupError("Choose an absolute parent folder.");
  let selected: string;
  try {
    selected = await realpath(resolve(parent));
    if (!(await stat(selected)).isDirectory())
      throw new Error("Not a directory");
    await access(selected, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch (error) {
    throw new SetupError(
      "The selected parent folder is unavailable. Choose another folder and check its permissions.",
      { cause: error },
    );
  }
  const target = appOwnedFolder(selected, name);
  try {
    await mkdir(target, { recursive: true, mode: 0o700 });
    const canonical = await realpath(target);
    if (!isSelectableLocalRoot(canonical))
      throw new SetupError("Choose a different parent folder for Grill Me.");
    return await readableDirectory(canonical);
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError(
      `Grill Me could not create or use the "${name}" folder. Choose another parent folder and check its permissions.`,
      { cause: error },
    );
  }
}

export async function completeFirstRun(
  input: StartupOptions & { choice: SetupChoice },
): Promise<SetupSelection> {
  const dataRoot = input.choice.dataParent
    ? await createAppOwnedRoot(input.choice.dataParent, input.dataFolderName)
    : await prepareDefaultDataRoot(input.configRoot);
  const workspaceRoot = input.choice.workspaceParent
    ? await createAppOwnedRoot(
        input.choice.workspaceParent,
        input.workspaceFolderName,
      )
    : await prepareDefaultWorkspaceRoot(dataRoot);
  if (dataRoot === workspaceRoot)
    throw new SetupError(
      "Choose different locations for app data and challenge workspaces.",
    );
  await writeSetupConfig(input.configRoot, {
    version: 1,
    channel: input.channel,
    completedAt: new Date().toISOString(),
    dataRoot,
    workspaceRoot,
  });
  return { dataRoot, workspaceRoot };
}

export async function resolveStartup(
  input: StartupOptions,
): Promise<StartupResolution> {
  const root = resolve(input.configRoot);
  const defaults: SetupDefaults = {
    dataRoot: root,
    workspaceRoot: defaultWorkspaceRoot(root),
  };
  const stored = await readSetupConfig(root, input.channel);
  if (stored.config) {
    try {
      const dataRoot = await prepareExistingRoot(stored.config.dataRoot);
      return {
        kind: "ready",
        dataRoot,
        workspaceRoot: stored.config.workspaceRoot,
        existing: false,
      };
    } catch (error) {
      return {
        kind: "setup",
        defaults,
        error:
          error instanceof SetupError
            ? error.message
            : "The saved app data folder is unavailable.",
        saved: {
          dataRoot: stored.config.dataRoot,
          workspaceRoot: stored.config.workspaceRoot,
        },
      };
    }
  }
  if (stored.found) {
    const message =
      stored.error === "The saved setup belongs to a different edition."
        ? "The saved setup belongs to a different edition. Choose where this edition keeps its data."
        : "The saved setup could not be read. Choose where Grill Me keeps your data. Existing folders are never moved or deleted.";
    return { kind: "setup", defaults, error: message, saved: null };
  }
  if (await hasExistingData(root)) {
    try {
      const dataRoot = await prepareExistingRoot(root);
      const workspaceRoot = defaultWorkspaceRoot(dataRoot);
      await writeSetupConfig(root, {
        version: 1,
        channel: input.channel,
        completedAt: new Date().toISOString(),
        dataRoot,
        workspaceRoot,
      }).catch(() => {
        // Existing installations keep working even when the launcher config
        // directory is read-only. Their data is detected again next launch.
      });
      return { kind: "ready", dataRoot, workspaceRoot, existing: true };
    } catch (error) {
      return {
        kind: "setup",
        defaults,
        error:
          error instanceof SetupError
            ? error.message
            : "The existing app data folder is unavailable. Reconnect it or choose another folder.",
        saved: { dataRoot: root, workspaceRoot: defaultWorkspaceRoot(root) },
      };
    }
  }
  return { kind: "setup", defaults, error: null, saved: null };
}
