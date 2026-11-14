import { constants } from "node:fs";
import {
  accessSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { z } from "zod";
import {
  workspaceLaunchSchema,
  type WorkspaceEditor,
  type WorkspaceEditorOption,
  type WorkspaceLaunch,
} from "@repo/backend/shared/contracts";

type EditorDefinition = {
  id: Exclude<WorkspaceEditor, "file-manager">;
  label: string;
  commands: string[];
  baseArgs?: string[];
  macBundles?: string[];
};

// Fixed definitions only. Renderer input selects an ID, never a command.
export const workspaceEditorDefinitions: EditorDefinition[] = [
  {
    id: "vscode",
    label: "VS Code",
    commands: ["code"],
    macBundles: ["Visual Studio Code.app/Contents/Resources/app/bin/code"],
  },
  {
    id: "cursor",
    label: "Cursor",
    commands: ["cursor"],
    baseArgs: ["--classic"],
    macBundles: ["Cursor.app/Contents/Resources/app/bin/cursor"],
  },
  {
    id: "zed",
    label: "Zed",
    commands: ["zeditor", "zed"],
    macBundles: ["Zed.app/Contents/MacOS/cli"],
  },
  {
    id: "vscode-insiders",
    label: "VS Code Insiders",
    commands: ["code-insiders"],
    macBundles: [
      "Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders",
    ],
  },
  {
    id: "vscodium",
    label: "VSCodium",
    commands: ["codium"],
    macBundles: ["VSCodium.app/Contents/Resources/app/bin/codium"],
  },
  {
    id: "idea",
    label: "IntelliJ IDEA",
    commands: ["idea"],
    macBundles: ["IntelliJ IDEA.app/Contents/MacOS/idea"],
  },
  {
    id: "webstorm",
    label: "WebStorm",
    commands: ["webstorm"],
    macBundles: ["WebStorm.app/Contents/MacOS/webstorm"],
  },
  {
    id: "pycharm",
    label: "PyCharm",
    commands: ["pycharm"],
    macBundles: ["PyCharm.app/Contents/MacOS/pycharm"],
  },
];

const markerSchema = z.object({
  version: z.literal(1),
  challengeId: z.string().uuid(),
  profileId: z.string().uuid(),
});

export type WorkspaceLaunchTarget =
  | {
      editor: WorkspaceEditor;
      path: string;
      command: string;
      args: string[];
      useShellOpen: false;
    }
  | {
      editor: "file-manager";
      path: string;
      useShellOpen: true;
    };

function executable(path: string) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

type EditorLookupOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Test seam; production uses the platform's standard launch directories. */
  pathDirectories?: string[];
};

function defaultPathDirectories(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
) {
  const directories: string[] = [];
  if (platform === "darwin")
    directories.push("/opt/homebrew/bin", "/usr/local/bin");
  if (platform === "linux")
    directories.push(
      join(env.HOME || homedir(), ".local/bin"),
      "/usr/local/bin",
      "/usr/bin",
      "/snap/bin",
    );
  return directories;
}

function commandOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  pathDirectories: string[],
) {
  const path = env.PATH ?? "";
  const directories = path.split(delimiter).filter(Boolean);
  directories.push(...pathDirectories);
  return directories
    .map((directory) => join(directory, command))
    .find((candidate) => executable(candidate));
}

function macBundle(command: string, env: NodeJS.ProcessEnv) {
  const home = env.HOME || homedir();
  return [`${home}/Applications`, "/Applications"]
    .map((root) => join(root, command))
    .find((candidate) => executable(candidate));
}

function toolboxScript(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
) {
  const home = env.HOME || homedir();
  if (platform === "darwin")
    return [
      join(
        home,
        "Library/Application Support/JetBrains/Toolbox/scripts",
        command,
      ),
    ].find((candidate) => executable(candidate));
  if (platform === "linux") {
    const data = env.XDG_DATA_HOME || join(home, ".local/share");
    return [join(data, "JetBrains/Toolbox/scripts", command)].find(
      (candidate) => executable(candidate),
    );
  }
  return undefined;
}

export function resolveEditorCommand(
  definition: EditorDefinition,
  options: EditorLookupOptions = {},
) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const pathDirectories =
    options.pathDirectories ?? defaultPathDirectories(platform, env);
  if (platform === "darwin" && definition.macBundles) {
    for (const bundle of definition.macBundles) {
      const found = macBundle(bundle, env);
      if (found) return found;
    }
  }
  for (const command of definition.commands) {
    const found = commandOnPath(command, env, platform, pathDirectories);
    if (found) return found;
    const toolbox = toolboxScript(command, env, platform);
    if (toolbox) return toolbox;
  }
  return undefined;
}

export function availableWorkspaceEditors(
  options: EditorLookupOptions = {},
): WorkspaceEditorOption[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const editors = workspaceEditorDefinitions.flatMap((definition) =>
    resolveEditorCommand(definition, { ...options, platform, env })
      ? [{ id: definition.id, label: definition.label }]
      : [],
  );
  return [...editors, { id: "file-manager", label: "File manager" }];
}

function resolvePosixPath(path: string, links = 0): string {
  if (links > 40) throw new Error("Too many symbolic links");
  const parts = path.split(sep);
  let current: string = sep;
  for (let index = 1; index < parts.length; index++) {
    const part = parts[index]!;
    if (!part || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    const next = current === sep ? join(sep, part) : join(current, part);
    if (lstatSync(next).isSymbolicLink())
      current = resolvePosixPath(
        resolve(dirname(next), readlinkSync(next)),
        links + 1,
      );
    else current = next;
  }
  return current;
}

function canonicalPath(path: string) {
  try {
    return realpathSync(path);
  } catch (error) {
    if (process.platform === "win32" || !path.includes("\\")) throw error;
    return resolvePosixPath(resolve(path));
  }
}

function markerMatches(
  path: string,
  expected: Pick<WorkspaceLaunch, "challengeId" | "profileId">,
) {
  const markerPath = join(path, ".grill-me", "workspace.json");
  const info = statSync(markerPath);
  if (!info.isFile() || info.size > 16 * 1024) return false;
  const marker = markerSchema.safeParse(
    JSON.parse(readFileSync(markerPath, "utf8")),
  );
  if (
    !marker.success ||
    marker.data.challengeId !== expected.challengeId ||
    marker.data.profileId !== expected.profileId
  )
    return false;
  const parts = path.split(sep);
  const challengeFolder = parts.at(-1) ?? "";
  const challengePrefix = expected.challengeId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toLowerCase();
  return (
    parts.at(-2) === expected.profileId &&
    parts.at(-3) === "profiles" &&
    challengeFolder.endsWith(`-${challengePrefix}`)
  );
}

// Desktop session variables only. Application tokens, provider keys, proxy
// credentials, and arbitrary shell configuration stay out of editor processes.
const editorEnvironmentKeys = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_RUNTIME_DIR",
  "XDG_DATA_HOME",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "XDG_CURRENT_DESKTOP",
  "XDG_SESSION_TYPE",
  "XDG_SESSION_DESKTOP",
  "DESKTOP_SESSION",
  "DBUS_SESSION_BUS_ADDRESS",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "GDK_BACKEND",
  "QT_QPA_PLATFORM",
  "ELECTRON_OZONE_PLATFORM_HINT",
  "SSH_AUTH_SOCK",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "__CF_USER_TEXT_ENCODING",
  "Apple_PubSub_Socket_Render",
  "SECURITYSESSIONID",
  "COMMAND_MODE",
]);

export function editorEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => editorEnvironmentKeys.has(key)),
  );
}

export function validateWorkspacePath(
  path: string,
  expected: Pick<WorkspaceLaunch, "challengeId" | "profileId">,
) {
  let directory: string;
  try {
    directory = canonicalPath(path);
    if (!statSync(directory).isDirectory()) throw new Error("Not a directory");
    if (directory === sep || !markerMatches(directory, expected))
      throw new Error("Not a challenge workspace");
  } catch {
    throw new Error(
      "This challenge folder is unavailable. Open the challenge and retry the workspace.",
    );
  }
  return directory;
}

export function resolveWorkspaceLaunch(
  input: WorkspaceLaunch,
  options: EditorLookupOptions = {},
): WorkspaceLaunchTarget {
  const parsed = workspaceLaunchSchema.parse(input);
  const path = validateWorkspacePath(parsed.path, parsed);
  if (parsed.editor === "file-manager")
    return { editor: "file-manager", path, useShellOpen: true };
  const definition = workspaceEditorDefinitions.find(
    (editor) => editor.id === parsed.editor,
  );
  if (!definition) throw new Error("This editor is not supported.");
  const command = resolveEditorCommand(definition, options);
  if (!command)
    throw new Error(
      `${definition.label} is not installed or could not be found.`,
    );
  return {
    editor: definition.id,
    path,
    command,
    args: [...(definition.baseArgs ?? []), path],
    useShellOpen: false,
  };
}

type EditorProcess = {
  once(event: "spawn", listener: () => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  unref(): void;
};
type SpawnEditor = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    detached: true;
    stdio: "ignore";
    shell: false;
    env: NodeJS.ProcessEnv;
  },
) => EditorProcess;

/**
 * Wait for the OS to actually start the editor before reporting success. Spawn
 * failures are asynchronous, so returning immediately would show a successful
 * launch that never happened.
 */
export function launchWorkspaceEditor(
  launch: Extract<WorkspaceLaunchTarget, { useShellOpen: false }>,
  spawnEditor: SpawnEditor = spawn as unknown as SpawnEditor,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: EditorProcess;
    try {
      child = spawnEditor(launch.command, launch.args, {
        cwd: launch.path,
        detached: true,
        stdio: "ignore",
        shell: false,
        env: editorEnvironment(),
      });
    } catch {
      reject(new Error("Could not open the workspace editor."));
      return;
    }
    let settled = false;
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
    child.once("error", () => {
      if (settled) return;
      settled = true;
      reject(new Error("Could not open the workspace editor."));
    });
  });
}
