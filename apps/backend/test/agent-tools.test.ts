import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSnapshotTools } from "@repo/backend/modules/ai/agent/tools/snapshot";
import { createTaskTools } from "@repo/backend/modules/ai/agent/tools/index";

test("task tools grant nothing unless a saved snapshot is explicitly requested", () => {
  expect(
    createTaskTools({ allowSnapshot: false }).map((tool) => tool.name),
  ).toEqual([]);
  expect(
    createTaskTools({
      allowSnapshot: true,
      workspace: "/tmp",
      manifest: [],
    }).map((tool) => tool.name),
  ).toEqual([
    "list_submission_files",
    "read_submission_file",
    "search_submission",
  ]);
});

test("snapshot tools only read manifest paths inside the saved submission", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-snapshot-tool-"));
  try {
    await writeFile(join(root, "answer.ts"), "export const answer = 42;");
    await writeFile(join(root, "secret.ts"), "export const secret = true;");
    const tools = createSnapshotTools(root, [
      { path: "answer.ts", bytes: 25, sha256: "fixture" },
    ]);
    const read = tools.find((tool) => tool.name === "read_submission_file")!;
    const result = await read.execute("call", { path: "answer.ts" }, undefined);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "export const answer = 42;",
    });
    await expect(
      read.execute("call", { path: "secret.ts" }, undefined),
    ).rejects.toThrow("not found");
    await expect(
      read.execute("call", { path: "../secret.ts" }, undefined),
    ).rejects.toThrow();
    const search = tools.find((tool) => tool.name === "search_submission")!;
    const found = await search.execute("call", { query: "answer" }, undefined);
    expect(found.content[0]).toMatchObject({
      type: "text",
      text: "answer.ts:1: export const answer = 42;",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
