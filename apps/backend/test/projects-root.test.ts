import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browseFolders } from "../src/modules/projects/browse";
import { projectRoot } from "../src/modules/projects/snapshot";

describe("configured projects root", () => {
  let root = "";
  let project = "";
  const previousRoot = process.env.PROJECTS_ROOT;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "grill-projects-root-"));
    project = join(root, "example-project");
    await mkdir(project);
    process.env.PROJECTS_ROOT = root;
  });

  afterAll(async () => {
    if (previousRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  });

  test("starts browsing at the configured root and stops upward navigation", async () => {
    const result = await browseFolders();
    expect(result.path).toBe(root);
    expect(result.parent).toBeNull();
    expect(result.folders).toEqual([
      { name: "example-project", path: project },
    ]);
  });

  test("allows child projects and rejects paths outside the configured root", async () => {
    expect(await projectRoot(project)).toBe(project);
    await expect(browseFolders(tmpdir())).rejects.toMatchObject({
      code: "FOLDER_OUTSIDE_PROJECTS_ROOT",
    });
    await expect(projectRoot(tmpdir())).rejects.toMatchObject({
      code: "PROJECT_OUTSIDE_PROJECTS_ROOT",
    });
  });
});
