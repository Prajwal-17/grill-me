import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSnapshotTools } from "@repo/backend/modules/ai/agent/tools/snapshot";
import { createTaskTools } from "@repo/backend/modules/ai/agent/tools/index";
import { createResearchTools } from "@repo/backend/modules/ai/agent/tools/research";

test("task tools grant nothing unless a saved snapshot or research workspace is explicitly requested", async () => {
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
  const root = await mkdtemp(join(tmpdir(), "grill-research-tools-"));
  try {
    expect(
      createTaskTools({
        allowSnapshot: false,
        allowResearch: true,
        researchWorkspace: root,
      }).map((tool) => tool.name),
    ).toEqual(["ls", "read", "grep", "fetch_url"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("research tools inspect temporary files without exposing a shell", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-research-tool-"));
  try {
    const tools = createResearchTools({ workspace: root });
    await writeFile(join(root, "answer.txt"), "Alpha\nBeta answer\n");
    const read = tools.find((tool) => tool.name === "read")!;
    expect(
      (await read.execute("call", { path: "answer.txt" }, undefined))
        .content[0],
    ).toMatchObject({ type: "text", text: "Alpha\nBeta answer\n" });
    const search = tools.find((tool) => tool.name === "grep")!;
    expect(
      (await search.execute("call", { query: "answer" }, undefined)).content[0],
    ).toMatchObject({
      type: "text",
      text: "answer.txt:2: Beta answer",
    });
    const list = tools.find((tool) => tool.name === "ls")!;
    expect(
      (await list.execute("call", {}, undefined)).content[0],
    ).toMatchObject({ type: "text" });
    await expect(
      read.execute("call", { path: "../outside.txt" }, undefined),
    ).rejects.toThrow("outside the research workspace");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fetch_url returns readable text and images, and blocks private hosts", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-research-fetch-"));
  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
  try {
    const tools = createResearchTools({
      workspace: root,
      allowImages: true,
      lookupHost: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/image.png"))
          return new Response(Buffer.from(pixel, "base64"), {
            headers: { "content-type": "image/png" },
          });
        return new Response(
          "<html><title>Docs</title><body><h1>Hello</h1><script>bad()</script><p>World</p></body></html>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }) as unknown as typeof fetch,
    });
    const fetchUrl = tools.find((tool) => tool.name === "fetch_url")!;
    const page = await fetchUrl.execute(
      "call",
      { url: "https://example.com/page" },
      undefined,
    );
    expect(page.content[0]).toMatchObject({
      type: "text",
      text: "Docs\n\nHello\nWorld",
    });
    const image = await fetchUrl.execute(
      "call",
      { url: "https://example.com/image.png" },
      undefined,
    );
    expect(image.content[0]).toMatchObject({
      type: "image",
      mimeType: "image/png",
    });
    await expect(
      fetchUrl.execute("call", { url: "http://127.0.0.1/secret" }, undefined),
    ).rejects.toThrow("private network");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
