/* eslint turbo/no-undeclared-env-vars: ["warn", { "allowList": ["^PROJECTS_ROOT$"] }] -- This fixture simulates a retired setting, not a supported runtime input. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { browseFolders } from "../../../packages/backend/src/modules/projects/browse";
import { projectRoot } from "../../../packages/backend/src/modules/projects/snapshot";

describe("local project folders", () => {
  let root = "";
  let project = "";
  const previousRoot = process.env.PROJECTS_ROOT;

  beforeAll(async () => {
    root = await realpath(
      await mkdtemp(join(tmpdir(), "grill-project-folders-")),
    );
    project = join(root, "project with spaces");
    await mkdir(project);
    // Retired settings must never restrict the folder chosen for a submission.
    process.env.PROJECTS_ROOT = join(root, "old-default-that-no-longer-exists");
    await writeFile(join(root, "not-a-folder.txt"), "fixture");
    await symlink(project, join(root, "project-link"));
  });

  afterAll(async () => {
    if (previousRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  });

  test("starts at the home folder even when an old projects root is unavailable", async () => {
    expect((await browseFolders()).path).toBe(await realpath(homedir()));
  });

  test("browses and accepts a selected folder outside the retired projects root", async () => {
    const result = await browseFolders(root);
    expect(result.parent).toBe(dirname(root));
    expect(result.folders).toContainEqual({
      name: "project with spaces",
      path: project,
    });
    expect(await projectRoot(project)).toBe(project);
    expect((await browseFolders(project)).parent).toBe(root);
  });

  test("canonicalizes a selected folder symlink without a global root restriction", async () => {
    expect(await projectRoot(join(root, "project-link"))).toBe(project);
    expect((await browseFolders(join(root, "project-link"))).path).toBe(
      project,
    );
  });

  test.skipIf(process.getuid?.() === 0)(
    "reports unreadable project folders before connecting",
    async () => {
      const privateFolder = join(root, "unreadable");
      await mkdir(privateFolder);
      await chmod(privateFolder, 0o000);
      try {
        await expect(projectRoot(privateFolder)).rejects.toMatchObject({
          code: "PROJECT_UNREADABLE",
        });
      } finally {
        await chmod(privateFolder, 0o700);
      }
    },
  );

  test("reports invalid and missing folder paths without suggesting a global default", async () => {
    await expect(browseFolders("relative/path")).rejects.toMatchObject({
      code: "ABSOLUTE_PATH_REQUIRED",
    });
    await expect(projectRoot("relative/path")).rejects.toMatchObject({
      code: "ABSOLUTE_PATH_REQUIRED",
    });
    await expect(browseFolders(join(root, "missing"))).rejects.toMatchObject({
      code: "FOLDER_UNAVAILABLE",
    });
    await expect(projectRoot(join(root, "missing"))).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
    });
    await expect(
      projectRoot(join(root, "not-a-folder.txt")),
    ).rejects.toMatchObject({
      code: "INVALID_PROJECT",
    });
    await expect(projectRoot("/")).rejects.toMatchObject({
      code: "INVALID_PROJECT",
    });
  });
});
