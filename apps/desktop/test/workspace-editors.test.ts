import { afterAll, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  availableWorkspaceEditors,
  editorEnvironment,
  launchWorkspaceEditor,
  resolveWorkspaceLaunch,
} from "../src/workspace-editors";
import type { WorkspaceLaunch } from "@repo/backend/shared/contracts";

const challengeId = "0f1e2d3c-4b5a-4978-8695-a4b3c2d1e0f9";
const profileId = "11111111-2222-4333-8444-555555555555";
const launchInput = (
  path: string,
  editor: WorkspaceLaunch["editor"],
): WorkspaceLaunch => ({ path, editor, challengeId, profileId });

const roots: string[] = [];
async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "grill-workspace-editors-"));
  roots.push(root);
  return root;
}
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function executable(root: string, name: string) {
  const path = join(root, name);
  await writeFile(path, "#!/bin/sh\nexit 0\n");
  await chmod(path, 0o755);
  return path;
}

async function challengeFolder(
  options: {
    challengeId?: string;
    profileId?: string;
  } = {},
) {
  const root = await tempRoot();
  const folder = join(
    root,
    "profiles",
    options.profileId ?? profileId,
    `0007-practice-${(options.challengeId ?? challengeId)
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 8)
      .toLowerCase()}`,
  );
  await mkdir(join(folder, ".grill-me"), { recursive: true });
  await writeFile(
    join(folder, ".grill-me/workspace.json"),
    JSON.stringify({
      version: 1,
      challengeId: options.challengeId ?? challengeId,
      profileId: options.profileId ?? profileId,
    }),
  );
  return realpath(folder);
}

describe("desktop workspace editors", () => {
  test("only reports installed editors and always offers the file manager", async () => {
    const bin = await tempRoot();
    await executable(bin, "code");
    await executable(bin, "zeditor");
    const options = availableWorkspaceEditors({
      platform: "linux",
      env: { PATH: bin, HOME: bin },
      pathDirectories: [],
    });
    expect(options).toEqual([
      { id: "vscode", label: "VS Code" },
      { id: "zed", label: "Zed" },
      { id: "file-manager", label: "File manager" },
    ]);
    expect(
      availableWorkspaceEditors({
        platform: "linux",
        env: { PATH: await tempRoot(), HOME: bin },
        pathDirectories: [],
      }),
    ).toEqual([{ id: "file-manager", label: "File manager" }]);
  });

  test("finds macOS bundle CLIs without relying on the shell PATH", async () => {
    const home = await tempRoot();
    const bundle = join(
      home,
      "Applications/Visual Studio Code.app/Contents/Resources/app/bin",
    );
    await mkdir(bundle, { recursive: true });
    const command = join(bundle, "code");
    await writeFile(command, "#!/bin/sh\nexit 0\n");
    await chmod(command, 0o755);
    const folder = await challengeFolder();
    expect(
      resolveWorkspaceLaunch(launchInput(folder, "vscode"), {
        platform: "darwin",
        env: { HOME: home, PATH: "" },
        pathDirectories: [],
      }),
    ).toMatchObject({ command, args: [folder] });
  });

  test("resolves allowlisted editors without a shell", async () => {
    const bin = await tempRoot();
    const command = await executable(bin, "code");
    const folder = await challengeFolder();
    const launch = resolveWorkspaceLaunch(launchInput(folder, "vscode"), {
      platform: "linux",
      env: { PATH: bin, HOME: bin },
      pathDirectories: [],
    });
    expect(launch).toEqual({
      editor: "vscode",
      path: folder,
      command,
      args: [folder],
      useShellOpen: false,
    });
    expect(
      resolveWorkspaceLaunch(launchInput(folder, "file-manager"), {
        platform: "linux",
        env: { PATH: bin, HOME: bin },
        pathDirectories: [],
      }),
    ).toEqual({
      editor: "file-manager",
      path: folder,
      useShellOpen: true,
    });
  });

  test("does not hand application credentials to an editor process", () => {
    const env = editorEnvironment({
      PATH: "/usr/bin",
      HOME: "/home/person",
      DESKTOP_DEV_API_TOKEN: "launcher-secret",
      OPENAI_API_KEY: "provider-secret",
      AWS_ACCESS_KEY_ID: "cloud-secret",
      AWS_SECRET_ACCESS_KEY: "cloud-secret",
      DATABASE_URL: "postgres://user:password@localhost/db",
      SSH_PRIVATE_KEY: "private-key",
      SSH_AUTH_SOCK: "/run/user/1000/ssh-agent",
      XDG_SESSION_TYPE: "wayland",
      ELECTRON_RUN_AS_NODE: "1",
    });
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/person",
      SSH_AUTH_SOCK: "/run/user/1000/ssh-agent",
      XDG_SESSION_TYPE: "wayland",
    });
  });

  test("rejects missing markers, mismatched ownership, and command-like editor IDs", async () => {
    const bin = await tempRoot();
    await executable(bin, "code");
    const unmarked = await tempRoot();
    const folder = await challengeFolder();
    const options = {
      platform: "linux" as const,
      env: { PATH: bin, HOME: bin },
      pathDirectories: [],
    };
    expect(() =>
      resolveWorkspaceLaunch(launchInput(unmarked, "vscode"), options),
    ).toThrow(/unavailable/);
    expect(() =>
      resolveWorkspaceLaunch(launchInput("relative", "vscode"), options),
    ).toThrow();
    expect(() =>
      resolveWorkspaceLaunch(
        launchInput(folder, "code; rm -rf /" as WorkspaceLaunch["editor"]),
        options,
      ),
    ).toThrow();

    const otherChallenge = await challengeFolder({
      challengeId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    expect(() =>
      resolveWorkspaceLaunch(launchInput(otherChallenge, "vscode"), options),
    ).toThrow(/unavailable/);
    const otherProfile = await challengeFolder({
      profileId: "99999999-8888-4777-8666-555555555555",
    });
    expect(() =>
      resolveWorkspaceLaunch(launchInput(otherProfile, "vscode"), options),
    ).toThrow(/unavailable/);
  });

  test("waits for the editor process to spawn and reports launch failures", async () => {
    const launch = {
      editor: "vscode" as const,
      path: "/tmp/workspace",
      command: "/usr/bin/code",
      args: ["/tmp/workspace"],
      useShellOpen: false as const,
    };
    let spawnListener: (() => void) | undefined;
    let errorListener: ((error: Error) => void) | undefined;
    let unreferenced = false;
    let options: Record<string, unknown> | undefined;
    const child = {
      once(event: "spawn" | "error", listener: (...args: never[]) => void) {
        if (event === "spawn") spawnListener = listener as () => void;
        else errorListener = listener as (error: Error) => void;
        return child;
      },
      unref() {
        unreferenced = true;
      },
    };
    let resolved = false;
    const task = launchWorkspaceEditor(launch, (_command, _args, value) => {
      options = value;
      return child;
    }).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    spawnListener!();
    await task;
    expect(unreferenced).toBe(true);
    expect(options).toMatchObject({
      cwd: launch.path,
      detached: true,
      shell: false,
      stdio: "ignore",
    });
    expect(editorEnvironment(process.env)).toEqual(
      options!.env as NodeJS.ProcessEnv,
    );

    errorListener = undefined;
    const failed = launchWorkspaceEditor(launch, () => child);
    await Promise.resolve();
    errorListener!(new Error("ENOENT"));
    await expect(failed).rejects.toThrow(
      "Could not open the workspace editor.",
    );
    await expect(
      launchWorkspaceEditor(launch, () => {
        throw new Error("ENOENT");
      }),
    ).rejects.toThrow("Could not open the workspace editor.");
  });
});
