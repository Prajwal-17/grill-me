import { afterAll, describe, expect, test } from "bun:test";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  challengeWorkspaceFolderName,
  challengeWorkspacePath,
  ensureChallengeWorkspace,
  type WorkspaceChallenge,
} from "@repo/backend/modules/challenges/workspace";

const roots: string[] = [];
async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "grill-workspace-"));
  roots.push(root);
  return root;
}
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

function challenge(
  patch: Partial<WorkspaceChallenge> = {},
): WorkspaceChallenge {
  return {
    id: "0f1e2d3c-4b5a-4978-8695-a4b3c2d1e0f9",
    profileId: "11111111-2222-4333-8444-555555555555",
    number: 7,
    title: "../../Hello: TypeScript?",
    topic: "TypeScript",
    problemStatement:
      "Write a function that groups words by their first letter.",
    expectedOutcome: "Submit the source function.",
    implementationBoundary: null,
    implementationMilestones: [],
    completionCriteria: ["Groups every word.", "Keeps empty groups out."],
    workspacePath: null,
    ...patch,
  };
}

describe("challenge workspaces", () => {
  test("builds stable profile-scoped folder names without traversal", () => {
    const value = challenge();
    expect(challengeWorkspaceFolderName(value)).toBe(
      "0007-hello-typescript-0f1e2d3c",
    );
    const path = challengeWorkspacePath("/tmp/workspaces", value);
    expect(path).toBe(
      "/tmp/workspaces/profiles/11111111-2222-4333-8444-555555555555/0007-hello-typescript-0f1e2d3c",
    );
    expect(path).not.toContain("..");
    expect(
      challengeWorkspaceFolderName(challenge({ title: "你好", topic: "Go" })),
    ).toBe("0007-challenge-0f1e2d3c");
  });

  test("seeds a README and marker exactly once", async () => {
    const root = await tempRoot();
    const value = challenge();
    const created = await ensureChallengeWorkspace({ challenge: value, root });
    expect(created.initialized).toBe(true);
    expect(created.starterFile).toBeNull();
    expect(created.path).toBe(challengeWorkspacePath(root, value));
    expect((await stat(created.path)).isDirectory()).toBe(true);
    expect(await readFile(join(created.path, "README.md"), "utf8")).toContain(
      "Groups every word.",
    );
    const marker = JSON.parse(
      await readFile(join(created.path, ".grill-me/workspace.json"), "utf8"),
    );
    expect(marker).toMatchObject({
      version: 1,
      challengeId: value.id,
      profileId: value.profileId,
      starterFile: null,
    });

    await writeFile(join(created.path, "README.md"), "My notes\n");
    await writeFile(join(created.path, "solution.ts"), "my implementation\n");
    const again = await ensureChallengeWorkspace({ challenge: value, root });
    expect(again.initialized).toBe(false);
    expect(await readFile(join(created.path, "README.md"), "utf8")).toBe(
      "My notes\n",
    );
    expect(await readFile(join(created.path, "solution.ts"), "utf8")).toBe(
      "my implementation\n",
    );
  });

  test("keeps an existing folder and never replaces user files", async () => {
    const root = await tempRoot();
    const value = challenge();
    const path = challengeWorkspacePath(root, value);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "README.md"), "Existing notes\n");
    const created = await ensureChallengeWorkspace({ challenge: value, root });
    expect(created.initialized).toBe(true);
    expect(created.starterFile).toBeNull();
    expect(await readFile(join(path, "README.md"), "utf8")).toBe(
      "Existing notes\n",
    );
  });

  test("keeps a workspace created under a previous root", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const value = challenge();
    const created = await ensureChallengeWorkspace({
      challenge: value,
      root: firstRoot,
    });
    const movedSetting = await ensureChallengeWorkspace({
      challenge: { ...value, workspacePath: created.path },
      root: secondRoot,
    });
    expect(movedSetting.path).toBe(created.path);
    expect(movedSetting.path.startsWith(firstRoot)).toBe(true);
  });

  test("relinks a copied data root after the recorded root disappears", async () => {
    const firstRoot = await tempRoot();
    const copiedRoot = join(await tempRoot(), "copied");
    const value = challenge();
    const created = await ensureChallengeWorkspace({
      challenge: value,
      root: firstRoot,
    });
    await writeFile(join(created.path, "notes.txt"), "my notes\n");
    await cp(firstRoot, copiedRoot, { recursive: true });
    await rm(firstRoot, { recursive: true, force: true });

    const relinked = await ensureChallengeWorkspace({
      challenge: { ...value, workspacePath: created.path },
      root: copiedRoot,
    });
    expect(relinked.path).toBe(challengeWorkspacePath(copiedRoot, value));
    expect(relinked.initialized).toBe(false);
    expect(await readFile(join(relinked.path, "notes.txt"), "utf8")).toBe(
      "my notes\n",
    );
  });

  test("explicit relinking never moves or deletes the recorded folder", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const value = challenge();
    const created = await ensureChallengeWorkspace({
      challenge: value,
      root: firstRoot,
    });
    await writeFile(join(created.path, "notes.txt"), "keep me\n");

    const relinked = await ensureChallengeWorkspace({
      challenge: { ...value, workspacePath: created.path },
      root: secondRoot,
      relink: true,
    });
    expect(relinked.path).toBe(challengeWorkspacePath(secondRoot, value));
    expect(await readFile(join(created.path, "notes.txt"), "utf8")).toBe(
      "keep me\n",
    );
  });

  test("refuses profile symlinks that would write outside the root", async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    const value = challenge();
    await mkdir(join(root, "profiles"), { recursive: true });
    await symlink(outside, join(root, "profiles", value.profileId));
    await expect(
      ensureChallengeWorkspace({ challenge: value, root }),
    ).rejects.toMatchObject({ code: "WORKSPACE_PATH_INVALID" });
    expect(await readdir(outside)).toEqual([]);
  });

  test.skipIf(process.getuid?.() === 0)(
    "reports recorded folder permission errors without relinking",
    async () => {
      const root = await tempRoot();
      const blocked = join(await tempRoot(), "blocked");
      const stored = join(blocked, "challenge");
      await mkdir(stored, { recursive: true });
      await chmod(blocked, 0o000);
      try {
        await expect(
          ensureChallengeWorkspace({
            challenge: challenge({ workspacePath: stored }),
            root,
          }),
        ).rejects.toMatchObject({
          code: "WORKSPACE_UNAVAILABLE",
          details: { path: stored },
        });
        expect(
          await stat(challengeWorkspacePath(root, challenge())).catch(
            () => null,
          ),
        ).toBeNull();
      } finally {
        await chmod(blocked, 0o700);
      }
    },
  );

  test("rejects relative workspace roots and stored paths", async () => {
    const root = await tempRoot();
    await expect(
      ensureChallengeWorkspace({ challenge: challenge(), root: "relative" }),
    ).rejects.toMatchObject({ code: "WORKSPACE_ROOT_INVALID" });
    await expect(
      ensureChallengeWorkspace({ challenge: challenge(), root: "/tmp/.." }),
    ).rejects.toMatchObject({ code: "WORKSPACE_ROOT_INVALID" });
    await expect(
      ensureChallengeWorkspace({
        challenge: challenge({ workspacePath: "relative" }),
        root,
      }),
    ).rejects.toMatchObject({ code: "WORKSPACE_PATH_INVALID" });
  });
});
