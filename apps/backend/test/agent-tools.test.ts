import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  htmlToText,
  validatePublicUrl,
} from "../../../packages/backend/src/modules/ai/agent/tools/web";
import { createSnapshotTools } from "../../../packages/backend/src/modules/ai/agent/tools/snapshot";
import { createSettingsService } from "../../../packages/backend/src/local/settings";
import { sessionSecretStore } from "../../../packages/backend/src/local/secrets";
import { createSettingsAgentRuntime } from "../../../packages/backend/src/local/agent-runtime";
import { startLocalServer } from "../../../packages/backend/src/local/server";
import {
  closeDatabase,
  initializeDatabase,
} from "../../../packages/backend/src/shared/database/db";

test("public page retrieval rejects local, private, metadata, file, and non-standard-port destinations", async () => {
  for (const url of [
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:7f00:1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/",
    "http://10.0.0.1/",
    "http://example.com:8080/",
    "https://user:pass@example.com/",
  ]) {
    await expect(validatePublicUrl(url)).rejects.toMatchObject({
      status: 400,
    });
  }
});

test("HTML retrieval converts scripts and markup to bounded text", () => {
  expect(
    htmlToText(
      "<html><head><style>body{}</style><script>steal()</script></head><body><h1>Title</h1><p>Hello &amp; welcome</p><p>Next</p></body></html>",
    ),
  ).toBe("Title\nHello & welcome\nNext");
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

test("settings keep API defaults and web search keys in SecretStore without exposing them", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-settings-api-"));
  try {
    const settings = createSettingsService(root, {
      keyring: sessionSecretStore(),
    });
    try {
      const id = crypto.randomUUID();
      await settings.saveProvider({
        id,
        name: "Fixture API",
        endpoint: "http://127.0.0.1:1/v1",
        model: "fixture-model",
        apiKey: "fixture-api-key",
        storage: "session",
      });
      await settings.activateProvider(id);
      const catalog = await settings.catalog();
      expect(catalog).toMatchObject({
        activeConnectionId: id,
        connections: [
          {
            id,
            name: "Fixture API",
            preset: "custom",
            defaultModel: "fixture-model",
          },
        ],
      });
      expect(JSON.stringify(catalog)).not.toContain("fixture-api-key");
      expect(JSON.stringify(await settings.get())).not.toContain(
        "fixture-api-key",
      );
      expect((await settings.snapshot()).apiKey).toBe("fixture-api-key");
      await settings.saveSearch({
        enabled: true,
        apiKey: "fixture-search-key",
        storage: "session",
      });
      expect((await settings.get()).search).toMatchObject({
        enabled: true,
        configured: true,
        storage: "session",
      });
      expect(await settings.searchKey()).toBe("fixture-search-key");
      expect(JSON.stringify(await settings.get())).not.toContain(
        "fixture-search-key",
      );
      await settings.saveSearch({
        enabled: false,
        removeKey: true,
        storage: "session",
      });
      expect(await settings.searchKey()).toBeUndefined();
      expect((await settings.get()).search.configured).toBe(false);
    } finally {
      settings.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy CLI settings remain readable but never start a process or resolve for AI execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-cli-inactive-"));
  const marker = join(root, "spawned");
  const binary = join(root, "codex");
  try {
    await writeFile(
      binary,
      `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "spawned");\n`,
      { mode: 0o700 },
    );
    const settings = createSettingsService(root, {
      keyring: sessionSecretStore(),
    });
    try {
      const id = crypto.randomUUID();
      await settings.saveProvider({
        id,
        name: "Preserved Codex",
        kind: "codex",
        binaryPath: binary,
        codexHome: join(root, "codex-home"),
        model: "auto",
        storage: "session",
      });
      expect(await settings.snapshot(id)).toMatchObject({
        kind: "codex",
        binaryPath: binary,
      });
      expect(await settings.testProvider(id)).toMatchObject({
        ok: false,
        code: "INTEGRATION_INACTIVE",
      });
      await expect(settings.models(id)).rejects.toMatchObject({
        code: "INTEGRATION_INACTIVE",
      });
      await settings.activateProvider(id);
      await expect(
        createSettingsAgentRuntime(settings).resolve(),
      ).rejects.toMatchObject({ code: "API_PROVIDER_REQUIRED" });
      expect(await Bun.file(marker).exists()).toBe(false);
    } finally {
      settings.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local server startup keeps preserved CLI settings inactive and never runs their executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-server-inactive-"));
  const marker = join(root, "spawned");
  const binary = join(root, "codex");
  try {
    await writeFile(
      binary,
      `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "spawned");\n`,
      { mode: 0o700 },
    );
    const id = crypto.randomUUID();
    const settings = createSettingsService(root, {
      keyring: sessionSecretStore(),
    });
    try {
      await settings.saveProvider({
        id,
        name: "Preserved Codex",
        kind: "codex",
        binaryPath: binary,
        codexHome: join(root, "codex-home"),
        model: "auto",
        storage: "session",
      });
    } finally {
      settings.close();
    }
    await closeDatabase();
    const server = await startLocalServer({
      dataRoot: root,
      token: "startup-fixture-token-" + crypto.randomUUID(),
      origins: ["grill-me://app"],
      keyring: sessionSecretStore(),
    });
    try {
      expect(await server.settings.testProvider(id)).toMatchObject({
        ok: false,
        code: "INTEGRATION_INACTIVE",
      });
      expect(await Bun.file(marker).exists()).toBe(false);
      expect((await server.settings.get()).providers[0]).toMatchObject({
        id,
        kind: "codex",
      });
    } finally {
      await server.stop();
      await initializeDatabase({
        dialect: "sqlite",
        path: process.env.GRILL_ME_SQLITE_PATH!,
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
