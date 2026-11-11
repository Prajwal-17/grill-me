import { afterAll, beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  chmod,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultProviderSettings } from "../../../packages/contracts/src";
import { createSettingsService } from "@repo/backend/local/settings";
import { fileSecretStore, type SecretStore } from "@repo/backend/local/secrets";
import { memorySecretStore } from "./fixtures/memory-secret-store";
const NativeWebSocket = WebSocket as unknown as {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};
const roots: string[] = [];
const temp = async () => {
  const path = await mkdtemp(join(tmpdir(), "grill-local-test-"));
  roots.push(path);
  return path;
};

const provider = (extra: object = {}) => ({
  id: crypto.randomUUID(),
  name: "Fixture",
  endpoint: "http://127.0.0.1:20128/v1",
  model: "fixture",
  apiKey: "fixture-secret-never-persist",
  storage: "keyring" as const,
  ...extra,
});
test("new-provider defaults follow the edition and saved model/reasoning choices survive restarts", async () => {
  expect(defaultProviderSettings("production")).toEqual({
    model: "gpt-6.1-sol",
    reasoningEffort: "high",
  });
  expect(defaultProviderSettings("development")).toEqual({
    model: "gpt-6-luna",
    reasoningEffort: "medium",
  });
  const root = await temp();
  const vault = memorySecretStore();
  let settings = createSettingsService(root, {
    keyring: vault,
    channel: "production",
  });
  try {
    expect((await settings.health()).code).toBe("MODEL_NOT_CONFIGURED");
    expect((await settings.get()).providerDefaults.model).toBe("gpt-6.1-sol");
    const chosen = provider({
      model: "custom-model",
      reasoningEffort: "xhigh",
    });
    await settings.saveProvider(chosen);
    settings.close();
    settings = createSettingsService(root, {
      keyring: vault,
      channel: "production",
    });
    expect(await settings.snapshot()).toMatchObject({
      model: "custom-model",
      reasoningEffort: "xhigh",
    });
    const legacy = provider();
    await settings.saveProvider(legacy);
    expect(await settings.snapshot(legacy.id)).not.toHaveProperty(
      "reasoningEffort",
    );
  } finally {
    settings.close();
  }
});

test("API connection checks discover models and report auth, limits, configuration, malformed catalogs, and offline failures without exposing upstream errors", async () => {
  const root = await temp();
  const settings = createSettingsService(root, {
    keyring: memorySecretStore(),
  });
  let status = 200;
  let malformed = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      malformed
        ? new Response("<html>not an API</html>")
        : Response.json(
            status === 200
              ? { data: [{ id: "gpt-6.1-sol" }, { id: "gpt-6-luna" }] }
              : { error: "secret-upstream-detail" },
            { status },
          ),
  });
  const saved = provider({ endpoint: `http://127.0.0.1:${server.port}/v1` });
  try {
    await settings.saveProvider(saved);
    expect((await settings.models(saved.id)).map((model) => model.id)).toEqual([
      "gpt-6.1-sol",
      "gpt-6-luna",
    ]);
    expect((await settings.health()).ok).toBe(true);
    for (const [httpStatus, code] of [
      [401, "PROVIDER_AUTH_REQUIRED"],
      [403, "PROVIDER_ACCESS_DENIED"],
      [429, "PROVIDER_RATE_LIMIT"],
      [404, "PROVIDER_MODEL_UNAVAILABLE"],
      [400, "PROVIDER_CONFIGURATION_INVALID"],
      [503, "PROVIDER_UNAVAILABLE"],
    ] as const) {
      status = httpStatus;
      const health = await settings.health();
      expect(health).toMatchObject({ ok: false, code });
      expect(JSON.stringify(health)).not.toContain("secret-upstream-detail");
    }
    status = 200;
    malformed = true;
    expect((await settings.health()).code).toBe("PROVIDER_RESPONSE_INVALID");
    server.stop(true);
    expect((await settings.health()).code).toBe("PROVIDER_UNREACHABLE");
  } finally {
    server.stop(true);
    settings.close();
  }
});
test("backend package imports without opening a database or listeners", async () => {
  const script = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "-e",
      'await import("@repo/backend");console.log("imported")',
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        APP_ENV: "production",
        GRILL_ME_DESKTOP: "1",
        GRILL_ME_SQLITE_PATH: "relative-invalid",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(await script.exited).toBe(0);
  expect(await new Response(script.stdout).text()).toContain("imported");
});
test("provider metadata survives restart while keys stay out of SQLite and responses", async () => {
  const root = await temp();
  const vault = memorySecretStore();
  const p = provider();
  let settings = createSettingsService(root, { keyring: vault });
  try {
    await settings.saveProvider(p);
    expect(await settings.get()).toMatchObject({
      activeProviderId: p.id,
      providers: [{ hasKey: true }],
    });
    expect(JSON.stringify(await settings.get())).not.toContain(p.apiKey);
    settings.close();
    settings = createSettingsService(root, { keyring: vault });
    expect((await settings.snapshot()).apiKey).toBe(p.apiKey);
    expect((await settings.get()).providers[0]?.hasKey).toBe(true);
  } finally {
    settings.close();
  }
  expect(
    (await readFile(join(root, "settings.sqlite"))).includes(p.apiKey),
  ).toBe(false);
});
test("failed key replacement preserves previous settings and credentials", async () => {
  const root = await temp();
  const backing = memorySecretStore();
  let fail = false;
  const vault: SecretStore = {
    ...backing,
    set: async (id, value) => {
      if (fail) throw new Error("locked");
      await backing.set(id, value);
    },
  };
  const settings = createSettingsService(root, { keyring: vault });
  const p = provider();
  try {
    await settings.saveProvider(p);
    fail = true;
    await expect(
      settings.saveProvider({ ...p, apiKey: "replacement", model: "changed" }),
    ).rejects.toThrow("Unlock");
    expect(await settings.snapshot()).toMatchObject({
      model: "fixture",
      apiKey: p.apiKey,
    });
    expect(JSON.stringify(await settings.get())).not.toContain(p.apiKey);
  } finally {
    settings.close();
  }
});
test("legacy session-only provider records load as keyring records without stale credentials", async () => {
  const root = await temp();
  let settings = createSettingsService(root, { keyring: memorySecretStore() });
  await settings.saveProvider(provider());
  settings.close();
  const db = new Database(join(root, "settings.sqlite"));
  const row = db.query("SELECT document FROM settings WHERE id=1").get() as {
    document: string;
  };
  const document = JSON.parse(row.document);
  document.providers[0].storage = "session";
  db.query("UPDATE settings SET document=? WHERE id=1").run(
    JSON.stringify(document),
  );
  db.close();
  settings = createSettingsService(root, { keyring: memorySecretStore() });
  try {
    expect((await settings.get()).providers[0]).toMatchObject({
      storage: "keyring",
      hasKey: false,
    });
    expect((await settings.snapshot()).apiKey).toBeUndefined();
  } finally {
    settings.close();
  }
});
test("plaintext credential files use owner-only permissions and persist", async () => {
  const root = await temp();
  const path = join(root, "secrets.json");
  const store = fileSecretStore(root);
  await store.set("fixture-key", "fixture-secret");
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(await readFile(path, "utf8")).toContain("fixture-secret");
  expect(await fileSecretStore(root).get("fixture-key")).toBe("fixture-secret");
  await chmod(path, 0o644);
  const repaired = fileSecretStore(root);
  expect((await repaired.status()).available).toBe(true);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  await repaired.remove("fixture-key");
  expect(await repaired.get("fixture-key")).toBeUndefined();
});
test("file-backed API keys survive restart and stay out of settings SQLite", async () => {
  const root = await temp();
  const p = { ...provider(), storage: "file" as const };
  let settings = createSettingsService(root, { keyring: memorySecretStore() });
  try {
    await settings.saveProvider(p);
    expect((await settings.get()).providers[0]).toMatchObject({
      storage: "file",
      hasKey: true,
    });
    expect(JSON.stringify(await settings.get())).not.toContain(p.apiKey);
    settings.close();
    settings = createSettingsService(root, { keyring: memorySecretStore() });
    expect((await settings.snapshot()).apiKey).toBe(p.apiKey);
    expect((await settings.get()).providers[0]?.hasKey).toBe(true);
    expect(await readFile(join(root, "secrets.json"), "utf8")).toContain(
      p.apiKey,
    );
    expect(
      (await readFile(join(root, "settings.sqlite"))).includes(p.apiKey),
    ).toBe(false);
  } finally {
    settings.close();
  }
});
test("legacy keys migrate to the plaintext file and are removed after verification", async () => {
  const root = await temp();
  const path = join(root, "backend.env");
  const key = "file-migration-fixture-secret";
  await writeFile(path, `LLM_API_KEY=${key}\nLLM_MODEL=fixture\n`, {
    mode: 0o600,
  });
  const settings = createSettingsService(root, {
    keyring: memorySecretStore(),
  });
  try {
    await settings.migrateLegacy("file");
    expect(await readFile(path, "utf8")).not.toContain(key);
    expect(await readFile(join(root, "secrets.json"), "utf8")).toContain(key);
    expect((await settings.snapshot()).apiKey).toBe(key);
    expect((await settings.get()).migration.pending).toBe(false);
  } finally {
    settings.close();
  }
});
test("legacy projects-root settings are ignored without losing providers or review limits", async () => {
  const root = await temp();
  const vault = memorySecretStore();
  const savedProvider = provider();
  let settings = createSettingsService(root, { keyring: vault });
  try {
    await settings.saveProvider(savedProvider);
    settings.close();
    const database = new Database(join(root, "settings.sqlite"));
    try {
      const row = database
        .query("SELECT document FROM settings WHERE id=1")
        .get() as { document: string };
      const document = JSON.parse(row.document);
      document.runtime.projectsRoot = "/old/default/no-longer-available";
      document.runtime.judgeTimeoutMs = 45000;
      database
        .query("UPDATE settings SET document=? WHERE id=1")
        .run(JSON.stringify(document));
    } finally {
      database.close();
    }
    settings = createSettingsService(root, { keyring: vault });
    const current = await settings.get();
    expect(current.runtime).not.toHaveProperty("projectsRoot");
    expect(current.runtime.judgeTimeoutMs).toBe(45000);
    expect(current.activeProviderId).toBe(savedProvider.id);
    expect((await settings.snapshot()).apiKey).toBe(savedProvider.apiKey);
    const saved = await settings.saveRuntime(current.runtime);
    expect(saved.runtime).not.toHaveProperty("projectsRoot");
  } finally {
    settings.close();
  }
});
test("legacy keys are removed only after verified persistent vault storage", async () => {
  const root = await temp();
  const path = join(root, "backend.env");
  const key = "migration-fixture-secret";
  await writeFile(path, `LLM_API_KEY=${key}\nLLM_MODEL=fixture\n`, {
    mode: 0o600,
  });
  let fail = true;
  const backing = memorySecretStore();
  const settings = createSettingsService(root, {
    keyring: {
      ...backing,
      set: async (id, value) => {
        if (fail) throw new Error("locked");
        await backing.set(id, value);
      },
    },
  });
  try {
    await expect(settings.migrateLegacy("keyring")).rejects.toThrow();
    expect(await readFile(path, "utf8")).toContain(key);
    fail = false;
    await settings.migrateLegacy("keyring");
    expect(await readFile(path, "utf8")).not.toContain(key);
    expect((await settings.snapshot()).apiKey).toBe(key);
    expect((await settings.get()).migration.pending).toBe(false);
  } finally {
    settings.close();
  }
});
let child: ReturnType<typeof Bun.spawn>;
let origin: string;
const token = "local-runtime-fixture-token-" + crypto.randomUUID();
beforeAll(async () => {
  const root = await temp();
  child = Bun.spawn(
    [process.execPath, "--no-env-file", "run", "test/local-server.fixture.ts"],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        APP_ENV: "development",
        GRILL_ME_DESKTOP: "1",
        GRILL_ME_HOME: root,
        DESKTOP_API_TOKEN: token,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  const { value } = await reader.read();
  if (!value)
    throw new Error(
      await new Response(child.stderr as ReadableStream<Uint8Array>).text(),
    );
  origin = `http://127.0.0.1:${JSON.parse(new TextDecoder().decode(value)).port}`;
  reader.releaseLock();
});
afterAll(async () => {
  if (child) {
    (child.stdin as import("bun").FileSink).end();
    await child.exited;
  }
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
async function bootstrap() {
  const response = await fetch(origin + "/_local/bootstrap", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ wsUrl: string; ticket: string }>;
}
async function socket() {
  const b = await bootstrap();
  const ws = new NativeWebSocket(b.wsUrl, {
    protocols: ["grill-me-v1", `ticket.${b.ticket}`],
    headers: { Origin: "grill-me://app" },
  });
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = reject;
  });
  return ws;
}
function receive(ws: WebSocket, predicate: (frame: any) => boolean) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error("Expected socket event"));
    }, 5000);
    const onMessage = (event: MessageEvent) => {
      const frame = JSON.parse(String(event.data));
      if (predicate(frame)) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        resolve(frame);
      }
    };
    ws.addEventListener("message", onMessage);
  });
}
test("local HTTP rejects missing credentials and foreign origins", async () => {
  expect((await fetch(origin + "/health")).status).toBe(401);
  expect(
    (
      await fetch(origin + "/health", {
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "https://evil.example",
        },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(origin + "/health", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
});
test("WebSocket requests reuse domain validation and publish committed changes", async () => {
  const ws = await socket();
  try {
    const initial = receive(ws, (f) => f.type === "changed");
    ws.send(JSON.stringify({ type: "subscribe" }));
    await initial;
    const id = crypto.randomUUID();
    const changed = receive(ws, (f) => f.type === "changed");
    const result = receive(ws, (f) => f.id === id);
    ws.send(
      JSON.stringify({
        type: "request",
        id,
        version: 1,
        call: {
          path: "/profiles/start",
          method: "POST",
          body: { email: "socket@test.local" },
        },
      }),
    );
    expect((await result).data.email).toBe("socket@test.local");
    await changed;
    const invalid = crypto.randomUUID();
    const error = receive(ws, (f) => f.id === invalid);
    ws.send(
      JSON.stringify({
        type: "request",
        id: invalid,
        version: 1,
        call: {
          path: "/profiles/start",
          method: "POST",
          body: { email: "invalid" },
        },
      }),
    );
    expect((await error).type).toBe("error");
  } finally {
    ws.close();
  }
});
test("a bootstrap ticket cannot be used twice", async () => {
  const b = await bootstrap();
  const open = () =>
    new NativeWebSocket(b.wsUrl, {
      protocols: ["grill-me-v1", `ticket.${b.ticket}`],
      headers: { Origin: "grill-me://app" },
    });
  const ws = open();
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = reject;
  });
  ws.close();
  const second = open();
  await new Promise<void>((resolve, reject) => {
    second.onopen = () => {
      second.close();
      reject(new Error("Ticket reused"));
    };
    second.onerror = () => resolve();
  });
});
test("malformed and duplicate frames cannot repeat a mutation", async () => {
  const ws = await socket();
  try {
    const id = crypto.randomUUID();
    const frame = JSON.stringify({
      type: "request",
      id,
      version: 1,
      call: {
        path: "/profiles/start",
        method: "POST",
        body: { email: "once@test.local" },
      },
    });
    const first = receive(ws, (f) => f.id === id);
    ws.send(frame);
    expect((await first).type).toBe("result");
    const duplicate = receive(ws, (f) => f.id === id);
    ws.send(frame);
    expect((await duplicate).error.code).toBe("REQUEST_REJECTED");
  } finally {
    ws.close();
  }
});

test("configured provider endpoint, key and model drive local AI calls without leaking keys into logs", async () => {
  const secret = "provider-integration-fixture-secret";
  let authorization = "";
  let requestedModel = "";
  const provider = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      authorization = request.headers.get("Authorization") ?? "";
      const body = (await request.json()) as { model: string };
      requestedModel = body.model;
      const args = JSON.stringify({
        displayName: null,
        background: [],
        languages: [],
        technologies: [],
        projects: [],
      });
      const events = [
        {
          type: "response.created",
          response: {
            id: "fixture-response",
            status: "in_progress",
            output: [],
          },
        },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: {
            type: "function_call",
            id: "fc_fixture",
            call_id: "call_fixture",
            name: "complete_resume",
            arguments: "",
            status: "in_progress",
          },
        },
        {
          type: "response.function_call_arguments.delta",
          output_index: 0,
          item_id: "fc_fixture",
          delta: args,
        },
        {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            type: "function_call",
            id: "fc_fixture",
            call_id: "call_fixture",
            name: "complete_resume",
            arguments: args,
            status: "completed",
          },
        },
        {
          type: "response.completed",
          response: {
            id: "fixture-response",
            status: "completed",
            output: [],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              total_tokens: 15,
            },
          },
        },
      ];
      return new Response(
        events
          .map(
            (event) =>
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  const ws = await socket();
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    profileId?: string,
  ) => {
    const id = crypto.randomUUID();
    const response = receive(ws, (f) => f.id === id);
    ws.send(
      JSON.stringify({
        type: "request",
        id,
        version: 1,
        call: { path, method, body, profileId },
      }),
    );
    return response;
  };
  try {
    const profile = await call("/profiles/start", "POST", {
      email: "provider-integration@test.local",
    });
    expect(profile.type).toBe("result");
    const saved = await call("/settings/providers", "POST", {
      id: crypto.randomUUID(),
      name: "Integration fixture",
      endpoint: `http://127.0.0.1:${provider.port}/v1`,
      model: "configured-fixture-model",
      apiKey: secret,
      storage: "keyring",
    });
    expect(saved.type).toBe("result");
    expect(JSON.stringify(saved)).not.toContain(secret);
    const preview = await call(
      "/profiles/resume/preview",
      "POST",
      {
        text: "Alex Rivera builds software in TypeScript and has experience with caching services.",
      },
      profile.data.id,
    );
    expect(preview.type).toBe("result");
    expect(authorization).toBe(`Bearer ${secret}`);
    expect(requestedModel).toBe("configured-fixture-model");
    const logs = await call("/logs", "GET", undefined, profile.data.id);
    expect(logs.type).toBe("result");
    expect(logs.data.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(secret);
  } finally {
    ws.close();
    await provider.stop(true);
  }
});
