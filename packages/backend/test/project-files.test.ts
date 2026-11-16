import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectWorkspace } from "@repo/backend/modules/challenges/project-workspace";
import {
  listProjectFiles,
  maxProjectFilePreviewBytes,
  readProjectFile,
} from "@repo/backend/modules/challenges/project-files";

const roots: string[] = [];

async function tempRoot() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "grill-project-files-")),
  );
  roots.push(root);
  return root;
}

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await tempRoot();
  const created = await createProjectWorkspace({ root });
  const project = created.layout.projectRoot;
  await writeFile(join(project, "README.md"), "# Project\n");
  await writeFile(
    join(project, "src", "app.ts"),
    "export const answer = 42;\n",
  );
  await writeFile(join(project, ".env.example"), "PORT=3000\n");
  await writeFile(join(project, ".env"), "PORT=3000\nSECRET=hidden\n");
  await mkdir(join(project, "node_modules", "pkg"), { recursive: true });
  await writeFile(
    join(project, "node_modules", "pkg", "index.js"),
    "module.exports = {};\n",
  );
  const outside = join(await tempRoot(), "outside.txt");
  await writeFile(outside, "outside\n");
  await symlink(outside, join(project, "src", "linked.txt"));
  await writeFile(join(project, "src", "binary.bin"), Buffer.from([0, 1, 2]));
  await writeFile(
    join(project, "src", "large.txt"),
    Buffer.alloc(maxProjectFilePreviewBytes + 1, 0x61),
  );
  return created.layout;
}

describe("read-only project files", () => {
  test("lists regular project files without following links or exposing secrets", async () => {
    const layout = await fixture();
    const result = await listProjectFiles(layout);
    const paths = result.files.map((file) => file.path);
    expect(paths).toContain("README.md");
    expect(paths).toContain("src/app.ts");
    expect(paths).toContain(".env.example");
    expect(paths).toContain("src/binary.bin");
    expect(paths).toContain("src/large.txt");
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain("src/linked.txt");
    expect(paths.some((path) => path.startsWith("node_modules/"))).toBe(false);
    expect(result.truncated).toBe(false);
  });

  test("returns text, binary, and oversized files without executing them", async () => {
    const layout = await fixture();
    await expect(readProjectFile(layout, "src/app.ts")).resolves.toMatchObject({
      path: "src/app.ts",
      content: "export const answer = 42;\n",
      binary: false,
      tooLarge: false,
    });
    await expect(
      readProjectFile(layout, "src/binary.bin"),
    ).resolves.toMatchObject({
      path: "src/binary.bin",
      content: null,
      binary: true,
      tooLarge: false,
    });
    const large = await readProjectFile(layout, "src/large.txt");
    expect(large.tooLarge).toBe(true);
    expect(large.content).toBeNull();
  });

  test("rejects traversal, symlinks, secrets, and missing paths", async () => {
    const layout = await fixture();
    for (const [path, code] of [
      ["../outside.txt", "PROJECT_PATH_INVALID"],
      ["src/../../outside.txt", "PROJECT_PATH_INVALID"],
      ["src/linked.txt", "PROJECT_PATH_INVALID"],
      [".env", "PROJECT_PATH_INVALID"],
      ["node_modules/pkg/index.js", "PROJECT_PATH_INVALID"],
      ["src/missing.ts", "PROJECT_FILE_NOT_FOUND"],
    ] as const) {
      await expect(readProjectFile(layout, path)).rejects.toMatchObject({
        code,
      });
    }
  });
});
