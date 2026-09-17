import { test, expect } from "bun:test";
import { mkdtemp, writeFile, rm, symlink, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { callSnapshotTool } from "../src/modules/judges/file-tools";

test("snapshot tools read beyond the first page and reject paths outside the snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-file-tools-"));
  try {
    const content = "a".repeat(40000) + "needle";
    await writeFile(join(root, "large.py"), content);
    await symlink("/etc/passwd", join(root, "escaped"));
    const first = await callSnapshotTool(root, "grill_read_file", {
      path: "large.py",
    });
    expect(first).toMatchObject({ offset: 0, nextOffset: 16384 });
    const last = await callSnapshotTool(root, "grill_read_file", {
      path: "large.py",
      offset: 32768,
    });
    expect(last).toMatchObject({
      text: content.slice(32768),
      nextOffset: null,
    });
    const found = await callSnapshotTool(root, "grill_search_file", {
      path: "large.py",
      query: "needle",
    });
    expect(JSON.stringify(found)).toContain("needle");
    await expect(
      callSnapshotTool(root, "grill_read_file", { path: "escaped" }),
    ).rejects.toThrow("Only files inside");
    await expect(
      callSnapshotTool(root, "grill_read_file", { path: "/etc/passwd" }),
    ).rejects.toThrow("Only files inside");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex transport correlates fragmented responses, rejects errors, and reconnects after exit", async () => {
  process.env.DATABASE_URL =
    "postgresql://grill_me:grill_me_local@localhost:5432/grill-me-test";
  const { CodexClient } = await import("../src/modules/judges/codex");
  const root = await mkdtemp(join(tmpdir(), "grill-protocol-"));
  const binary = join(root, "fixture");
  await writeFile(
    binary,
    `#!/usr/bin/env bun
import { createInterface } from "node:readline";
createInterface({ input: process.stdin }).on("line", (line) => {
  const req = JSON.parse(line);
  if (req.id === undefined) return;
  if (req.method === "exit") process.exit(1);
  const value = req.method === "error"
    ? { id: req.id, error: { message: "fixture provider error" } }
    : { id: req.id, result: { method: req.method } };
  const text = JSON.stringify(value) + "\\n";
  process.stdout.write(text.slice(0, 9));
  setTimeout(() => process.stdout.write(text.slice(9)), 5);
});
`,
  );
  await chmod(binary, 0o700);
  const client = new CodexClient(binary);
  try {
    await client.initialize();
    expect(await client.request<{ method: string }>("probe", {})).toEqual({
      method: "probe",
    });
    await expect(client.request("error", {})).rejects.toThrow(
      "fixture provider error",
    );
    await expect(client.request("exit", {})).rejects.toThrow("exited");
    const reconnected = new CodexClient(binary);
    try {
      await reconnected.initialize();
      expect(
        await reconnected.request<{ method: string }>("probe", {}),
      ).toEqual({
        method: "probe",
      });
    } finally {
      reconnected.close();
    }
  } finally {
    client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("folder upload paths preserve nested source and reject traversal and credentials", async () => {
  const { submissionPath } = await import("../src/modules/projects/paths");
  expect(submissionPath("project/src/main.py")).toBe("project/src/main.py");
  for (const path of [
    "../escape.py",
    "/tmp/escape.py",
    "project/../escape.py",
    "project/.env",
    "project/node_modules/index.js",
    "project\\escape.py",
    "project//file.py",
  ])
    expect(() => submissionPath(path)).toThrow();
});
