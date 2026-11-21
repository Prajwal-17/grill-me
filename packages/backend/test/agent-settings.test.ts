import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSettingsService } from "@repo/backend/local/settings";
import { memorySecretStore } from "./fixtures/memory-secret-store";
import { createSettingsAgentRuntime } from "@repo/backend/local/agent-runtime";
import { startLocalServer } from "@repo/backend/local/server";
import {
  closeDatabase,
  initializeDatabase,
} from "@repo/backend/shared/database/db";

test("default model and effort drive AI requests without an explicit selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-default-selection-"));
  try {
    const settings = createSettingsService(root, {
      keyring: memorySecretStore(),
    });
    try {
      const first = crypto.randomUUID();
      await settings.saveProvider({
        id: first,
        name: "Fixture API",
        endpoint: "http://127.0.0.1:1/v1",
        model: "fixture-a",
        apiKey: "fixture-api-key",
        storage: "keyring",
      });
      const second = crypto.randomUUID();
      await settings.saveProvider({
        id: second,
        name: "Fixture B",
        endpoint: "http://127.0.0.1:1/v1",
        model: "fixture-b",
        apiKey: "fixture-api-key-b",
        storage: "keyring",
      });
      await settings.activateProvider(second);

      // No default yet: the active connection's own model is used.
      expect(await settings.resolveSelection()).toMatchObject({
        id: second,
        model: "fixture-b",
      });

      await settings.saveDefaultSelection({
        providerId: first,
        model: "fixture-a",
        reasoningEffort: "low",
      });
      expect((await settings.get()).defaultSelection).toMatchObject({
        providerId: first,
        model: "fixture-a",
      });
      expect((await settings.catalog()).defaultSelection).toMatchObject({
        providerId: first,
      });
      expect(await settings.resolveSelection()).toMatchObject({
        id: first,
        model: "fixture-a",
        reasoningEffort: "low",
      });
      // An explicit selection still wins.
      expect(
        await settings.resolveSelection({
          providerId: second,
          model: "fixture-b",
          reasoningEffort: null,
        }),
      ).toMatchObject({ id: second, model: "fixture-b" });

      // Clearing falls back to the active connection again.
      await settings.saveDefaultSelection(null);
      expect((await settings.get()).defaultSelection).toBeNull();
      expect(await settings.resolveSelection()).toMatchObject({
        id: second,
        model: "fixture-b",
      });

      // Removing the referenced provider clears the stale default.
      await settings.saveDefaultSelection({
        providerId: first,
        model: "fixture-a",
        reasoningEffort: null,
      });
      await settings.removeProvider(first);
      expect((await settings.get()).defaultSelection).toBeNull();
      expect(await settings.resolveSelection()).toMatchObject({
        id: second,
        model: "fixture-b",
      });

      // Unknown or disabled providers are rejected.
      await expect(
        settings.saveDefaultSelection({
          providerId: crypto.randomUUID(),
          model: "fixture-a",
        }),
      ).rejects.toMatchObject({ code: "PROVIDER_NOT_FOUND" });
    } finally {
      settings.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settings keep API defaults and keys in SecretStore without exposing them", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-settings-api-"));
  try {
    const settings = createSettingsService(root, {
      keyring: memorySecretStore(),
    });
    try {
      const id = crypto.randomUUID();
      await settings.saveProvider({
        id,
        name: "Fixture API",
        endpoint: "http://127.0.0.1:1/v1",
        model: "fixture-model",
        apiKey: "fixture-api-key",
        storage: "keyring",
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
      keyring: memorySecretStore(),
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
        storage: "keyring",
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
      keyring: memorySecretStore(),
    });
    try {
      await settings.saveProvider({
        id,
        name: "Preserved Codex",
        kind: "codex",
        binaryPath: binary,
        codexHome: join(root, "codex-home"),
        model: "auto",
        storage: "keyring",
      });
    } finally {
      settings.close();
    }
    await closeDatabase();
    const server = await startLocalServer({
      dataRoot: root,
      token: "startup-fixture-token-" + crypto.randomUUID(),
      origins: ["grill-me://app"],
      keyring: memorySecretStore(),
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
