import { test, expect } from "bun:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { providerInputSchema, providerSchema } from "@repo/contracts";
import { createCliProviders } from "../../../packages/backend/src/local/providers";
import { createSettingsService } from "../../../packages/backend/src/local/settings";
import { memorySecretStore } from "../../backend/test/fixtures/memory-secret-store";
import { executablePath } from "@repo/backend/local/executable-path";
import {
  executable,
  providerEnvironment,
} from "../../../packages/backend/src/local/providers/common";

test("Codex reuses an existing CLI home and reports the account without a separate sign-in", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-codex-existing-"));
  const manager = createCliProviders(root);
  try {
    const shared = join(root, "existing-codex");
    await mkdir(shared);
    await writeFile(join(shared, "signed-in"), "existing-login");
    const binary = join(root, "codex");
    await writeFile(
      binary,
      `#!${process.execPath}\nimport ${JSON.stringify(resolve(import.meta.dir, "fixtures/cli-provider.ts"))};\n`,
    );
    await chmod(binary, 0o700);
    const provider = providerSchema.parse({
      id: crypto.randomUUID(),
      kind: "codex",
      name: "Codex",
      model: "auto",
      codexHome: shared,
      binaryPath: binary,
    });
    const environment = await providerEnvironment(root, provider);
    expect(environment.env.HOME).toBe(process.env.HOME);
    expect(environment.env.CODEX_HOME).toBe(shared);
    const defaults = await providerEnvironment(root, {
      ...provider,
      codexHome: "",
    });
    const inheritedHome =
      process.env.CODEX_HOME || join(process.env.HOME!, ".codex");
    expect(defaults.env.CODEX_HOME).toBe(
      inheritedHome.startsWith("~/")
        ? join(process.env.HOME!, inheritedHome.slice(2))
        : inheritedHome,
    );
    const status = await manager.status(provider);
    expect(status.connected).toBe(true);
    expect(status.account).toEqual({
      type: "chatgpt",
      email: "fixture@example.test",
      plan: "pro",
    });
    expect(status.homePath).toBe(shared);
    expect(
      await Bun.file(
        join(root, "providers", provider.id, "config", "signed-in"),
      ).exists(),
    ).toBe(false);
    manager.disconnect(provider.id);
    expect(await readFile(join(shared, "signed-in"), "utf8")).toBe(
      "existing-login",
    );
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("provider on/off state is independent from selection and persists without automatic fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-provider-toggles-"));
  const cli = createCliProviders(root);
  let settings = createSettingsService(root, {
    cli,
    keyring: memorySecretStore(),
  });
  try {
    const omni = {
      id: crypto.randomUUID(),
      kind: "openai" as const,
      name: "OmniRoute",
      endpoint: "http://127.0.0.1:1/v1",
      model: "auto",
      enabled: false,
    };
    const codex = {
      id: crypto.randomUUID(),
      kind: "codex" as const,
      name: "Codex",
      binaryPath: join(root, "missing-codex"),
      codexHome: join(root, "test-home"),
      model: "auto",
      enabled: false,
    };
    await settings.saveProvider(omni);
    await settings.saveProvider(codex);
    expect((await settings.get()).activeProviderId).toBeNull();
    await expect(settings.activateProvider(codex.id)).rejects.toMatchObject({
      code: "PROVIDER_DISABLED",
    });
    await settings.setProviderEnabled(omni.id, true);
    await settings.setProviderEnabled(codex.id, true);
    expect((await settings.get()).activeProviderId).toBe(omni.id);
    await settings.activateProvider(codex.id);
    expect((await settings.snapshot()).id).toBe(codex.id);
    await settings.setProviderEnabled(codex.id, false);
    await settings.saveProvider({
      ...codex,
      enabled: true,
      name: "Edited while off",
    });
    expect(
      (await settings.get()).providers.find((p) => p.id === codex.id)?.enabled,
    ).toBe(false);
    expect((await settings.get()).activeProviderId).toBeNull();
    await expect(settings.snapshot(codex.id)).rejects.toMatchObject({
      code: "PROVIDER_DISABLED",
    });
    await settings.activateProvider(omni.id);
    settings.close();
    settings = createSettingsService(root, {
      cli,
      keyring: memorySecretStore(),
    });
    expect(
      (await settings.get()).providers.find((p) => p.id === codex.id)?.enabled,
    ).toBe(false);
    expect((await settings.get()).activeProviderId).toBe(omni.id);
  } finally {
    settings.close();
    await cli.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI providers reuse an executable with isolated authentication, saved turns, cancellation and sanitized failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-cli-test-"));
  const manager = createCliProviders(root);
  try {
    const binary = join(root, "codex");
    await writeFile(
      binary,
      `#!${process.execPath}\nimport ${JSON.stringify(resolve(import.meta.dir, "fixtures/cli-provider.ts"))};\n`,
    );
    await chmod(binary, 0o700);
    const p = providerSchema.parse({
      id: crypto.randomUUID(),
      name: "Fixture Codex",
      kind: "codex",
      binaryPath: binary,
      model: "auto",
      reasoningEffort: "xhigh",
    });
    p.codexHome = join(root, "providers", p.id, "config");
    const signedOut = await manager.status(p);
    expect(signedOut.installed).toBe(true);
    expect(signedOut.code).toBe("PROVIDER_AUTH_REQUIRED");
    const login = await manager.signIn(p);
    expect(login.login?.url).toBe("https://auth.openai.com/fixture-login");
    const home = join(root, "providers", p.id, "config");
    await writeFile(join(home, "signed-in"), "fixture-only");
    const status = await manager.status(p);
    expect(status.connected).toBe(true);
    expect(status.models[0]?.id).toBe("fixture-model");
    expect(status.models[1]?.id).toBe("second-model");
    expect(status.models[0]?.reasoningEfforts).toEqual([
      "medium",
      "high",
      "xhigh",
    ]);
    manager.disconnect(p.id);
    expect((await manager.status(p)).code).toBe("PROVIDER_DISCONNECTED");
    expect((await manager.status(p)).connected).toBe(false);
    expect((await manager.connect(p)).connected).toBe(true);
    let text = "";
    for await (const delta of manager
      .transport(p)
      .run({ instructions: "Review only", input: "Hello" }))
      text += delta;
    expect(text).toBe("Saved response");
    const params = JSON.parse(
      await readFile(join(home, "thread.json"), "utf8"),
    );
    expect(params).not.toHaveProperty("ephemeral");
    expect(params.sandbox).toBe("read-only");
    expect(params.cwd.startsWith(root)).toBe(true);
    expect(
      JSON.parse(await readFile(join(home, "turn.json"), "utf8")).effort,
    ).toBe("xhigh");
    let changed = "";
    for await (const delta of manager
      .transport({ ...p, model: "second-model", reasoningEffort: "medium" })
      .run({ instructions: "", input: "Changed settings" }))
      changed += delta;
    expect(changed).toBe("Saved response");
    expect(
      JSON.parse(await readFile(join(home, "turn.json"), "utf8")).effort,
    ).toBe("medium");
    expect(
      JSON.parse(await readFile(join(home, "thread.json"), "utf8")).model,
    ).toBe("second-model");
    await expect(
      (async () => {
        for await (const _ of manager
          .transport({ ...p, model: "second-model", reasoningEffort: "xhigh" })
          .run({ instructions: "", input: "" })) {
          /* rejected before inference */
        }
      })(),
    ).rejects.toMatchObject({ code: "PROVIDER_REASONING_UNSUPPORTED" });
    const abort = new AbortController();
    const pending = (async () => {
      for await (const _delta of manager
        .transport(p)
        .run({ instructions: "", input: "WAIT", signal: abort.signal })) {
        /* fixture waits */
      }
    })();
    setTimeout(() => abort.abort(), 150);
    await expect(pending).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    const crash = (async () => {
      for await (const _delta of manager
        .transport(p)
        .run({ instructions: "", input: "CRASH" })) {
        /* fixture exits */
      }
    })();
    await expect(crash).rejects.toMatchObject({
      code: "PROVIDER_CONNECTION_FAILED",
    });
    const invalid = manager.transport({ ...p, model: "missing-model" });
    await expect(
      (async () => {
        for await (const _ of invalid.run({ instructions: "", input: "" })) {
          /* no request */
        }
      })(),
    ).rejects.toMatchObject({ code: "PROVIDER_MODEL_UNAVAILABLE" });
    const missing = await manager.status({
      ...p,
      id: crypto.randomUUID(),
      binaryPath: join(root, "does-not-exist"),
    });
    expect(missing.code).toBe("CLI_NOT_INSTALLED");
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
}, 15000);

test("provider contracts migrate existing API entries and reject CLI secrets or invalid API endpoints", () => {
  const old = {
    id: crypto.randomUUID(),
    name: "Existing API",
    endpoint: "http://127.0.0.1:8000/v1",
    model: "fixture",
  };
  expect(providerInputSchema.parse(old).kind).toBe("openai");
  expect(
    providerInputSchema.safeParse({ ...old, endpoint: undefined }).success,
  ).toBe(false);
  expect(
    providerInputSchema.safeParse({
      ...old,
      kind: "codex",
      apiKey: "should-not-be-stored",
    }).success,
  ).toBe(false);
  expect(
    providerInputSchema.safeParse({
      ...old,
      kind: "codex",
      binaryPath: "relative-codex",
    }).success,
  ).toBe(false);
});

test("disconnect survives a backend restart until explicit Connect or Use provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-cli-disconnect-"));
  let manager = createCliProviders(root);
  let settings = createSettingsService(root, {
    cli: manager,
    keyring: memorySecretStore(),
  });
  try {
    const binary = join(root, "codex");
    await writeFile(
      binary,
      `#!${process.execPath}\nimport ${JSON.stringify(resolve(import.meta.dir, "fixtures/cli-provider.ts"))};\n`,
    );
    await chmod(binary, 0o700);
    const p = providerInputSchema.parse({
      id: crypto.randomUUID(),
      name: "Codex fixture",
      kind: "codex",
      binaryPath: binary,
      model: "auto",
    });
    p.codexHome = join(root, "providers", p.id, "config");
    await settings.saveProvider(p);
    await manager.status(providerSchema.parse(p));
    await writeFile(
      join(root, "providers", p.id, "config", "signed-in"),
      "fixture-only",
    );
    expect((await manager.status(providerSchema.parse(p))).connected).toBe(
      true,
    );
    await settings.disconnectProvider(p.id);
    expect((await settings.get()).activeProviderId).toBeNull();
    settings.close();
    await manager.close();
    manager = createCliProviders(root);
    settings = createSettingsService(root, {
      cli: manager,
      keyring: memorySecretStore(),
    });
    const saved = await settings.provider(p.id);
    expect((await manager.status(saved)).code).toBe("PROVIDER_DISCONNECTED");
    await settings.saveProvider({ ...p, name: "Edited while disconnected" });
    expect((await settings.get()).activeProviderId).toBeNull();
    expect((await manager.status(saved)).connected).toBe(false);
    expect((await settings.connectProvider(p.id)).connected).toBe(true);
    await settings.disconnectProvider(p.id);
    await settings.activateProvider(p.id);
    expect((await manager.status(saved)).connected).toBe(true);
  } finally {
    settings.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("OpenCode auto-discovery finds a user installation outside the desktop PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-opencode-path-"));
  try {
    const home = join(root, "home");
    const binary = join(home, ".opencode", "bin", "opencode");
    await mkdir(join(home, ".opencode", "bin"), { recursive: true });
    await writeFile(
      binary,
      `#!${process.execPath}\nimport ${JSON.stringify(resolve(import.meta.dir, "fixtures/opencode-provider.ts"))};\n`,
    );
    await chmod(binary, 0o700);
    const provider = providerSchema.parse({
      id: crypto.randomUUID(),
      name: "OpenCode",
      kind: "opencode",
      binaryPath: "",
      model: "auto",
    });
    const found = await executable(provider, {
      HOME: home,
      PATH: executablePath({ HOME: home, PATH: "" }),
    });
    expect(found.path).toBe(binary);
    expect(found.version).toContain("opencode");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("OpenCode uses an authenticated isolated server, filters user events, enforces review permissions and keeps sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-opencode-test-"));
  const manager = createCliProviders(root);
  try {
    const binary = join(root, "opencode");
    await writeFile(
      binary,
      `#!${process.execPath}\nimport ${JSON.stringify(resolve(import.meta.dir, "fixtures/opencode-provider.ts"))};\n`,
    );
    await chmod(binary, 0o700);
    const provider = providerSchema.parse({
      id: crypto.randomUUID(),
      name: "Fixture OpenCode",
      kind: "opencode",
      binaryPath: binary,
      model: "fixture/fixture-model",
    });
    expect((await manager.status(provider)).authenticated).toBe(false);
    const connected = await manager.signIn(provider, {
      providerId: "fixture",
      methodIndex: 0,
      key: "fixture-key",
    });
    expect(connected.connected).toBe(true);
    expect(connected.models[0]?.id).toBe("fixture/fixture-model");
    expect(connected.models[0]).toMatchObject({
      name: "Fixture model",
      providerId: "fixture",
      providerName: "Fixture account",
    });
    const chunks: string[] = [];
    for await (const delta of manager
      .transport(provider)
      .run({ instructions: "Review only", input: "Review this input" }))
      chunks.push(delta);
    expect(chunks.join("")).toBe("OpenCode response");
    expect(chunks.join("")).not.toContain("User text");
    const home = join(root, "providers", provider.id, "data");
    expect(await Bun.file(join(home, "created-session")).exists()).toBe(true);
    expect(await Bun.file(join(home, "deleted-session")).exists()).toBe(false);
    const permissions = JSON.parse(
      await readFile(join(home, "permissions.json"), "utf8"),
    );
    expect(permissions.permission).toContainEqual({
      permission: "bash",
      pattern: "*",
      action: "deny",
    });
    const prompt = JSON.parse(
      await readFile(join(home, "request.json"), "utf8"),
    );
    expect(prompt.tools.bash).toBe(false);
    expect(prompt.tools.edit).toBe(false);
    expect(prompt.tools.read).toBe(false);
    for await (const _delta of manager.transport(provider).run({
      instructions: "Generate a quiz",
      input: "Topic",
      schema: { type: "object", properties: {} },
    })) {
      /* structured generation */
    }
    const generated = JSON.parse(
      await readFile(join(home, "request.json"), "utf8"),
    );
    expect(generated.format).toEqual({
      type: "json_schema",
      schema: { type: "object", properties: {} },
      retryCount: 0,
    });
    expect(generated.system).toContain("responding inside Grill Me");
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
}, 15000);

test("provider errors distinguish limits, authentication, unsupported protocols, and timeouts without echoing secrets", async () => {
  const { providerError } =
    await import("../../../packages/backend/src/local/providers/common");
  expect(
    providerError({ data: { codexErrorInfo: "usageLimitExceeded" } }, "Codex")
      .code,
  ).toBe("PROVIDER_RATE_LIMIT");
  expect(
    providerError({ status: 400, code: "context_length_exceeded" }, "API").code,
  ).toBe("PROVIDER_CONTEXT_LIMIT");
  expect(providerError({ status: 504 }, "API").code).toBe("PROVIDER_TIMEOUT");
  expect(providerError({ data: { statusCode: 401 } }, "OpenCode").code).toBe(
    "PROVIDER_AUTH_REQUIRED",
  );
  expect(providerError({ code: -32601 }, "Codex").code).toBe(
    "CLI_INCOMPATIBLE",
  );
  expect(
    providerError(new DOMException("raw secret token", "TimeoutError"), "Codex")
      .code,
  ).toBe("PROVIDER_TIMEOUT");
  expect(
    providerError(
      new Error("Authorization: Bearer sensitive-fixture"),
      "OpenCode",
    ).message,
  ).not.toContain("sensitive-fixture");
});

test("OpenCode 2 uses integration auth, acknowledged SSE subscription, saved sessions, and cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-opencode2-test-"));
  const manager = createCliProviders(root);
  try {
    const binary = join(root, "opencode2");
    await writeFile(
      binary,
      `#!${process.execPath}\nimport ${JSON.stringify(resolve(import.meta.dir, "fixtures/opencode2-provider.ts"))};\n`,
    );
    await chmod(binary, 0o700);
    const provider = providerSchema.parse({
      id: crypto.randomUUID(),
      name: "OpenCode 2",
      kind: "opencode",
      binaryPath: binary,
      model: "fixture/fixture-model",
    });
    expect((await manager.status(provider)).authenticated).toBe(false);
    const oauth = await manager.signIn(provider, {
      providerId: "fixture",
      methodIndex: 1,
    });
    expect(oauth.login?.method).toBe("code");
    expect(oauth.login?.url).toBe("https://example.test/login");
    expect(
      (
        await manager.signIn(provider, {
          providerId: "fixture",
          methodIndex: 1,
          complete: true,
          code: "fixture-code",
        })
      ).connected,
    ).toBe(true);
    expect(
      (
        await manager.signIn(provider, {
          providerId: "fixture",
          methodIndex: 0,
          key: "fixture-key",
        })
      ).models[0],
    ).toMatchObject({
      id: "fixture/fixture-model",
      name: "Fixture v2 model",
      providerId: "fixture",
      providerName: "Fixture account",
    });
    let text = "";
    for await (const delta of manager
      .transport(provider)
      .run({ instructions: "Review only", input: "Explain this requirement" }))
      text += delta;
    expect(text).toBe("OpenCode 2 response");
    const home = join(root, "providers", provider.id, "data");
    expect(
      JSON.parse(await readFile(join(home, "permissions.json"), "utf8"))
        .permissions,
    ).toContainEqual({ action: "*", resource: "*", effect: "deny" });
    expect(
      JSON.parse(await readFile(join(home, "instructions.json"), "utf8")).value,
    ).toContain("Never modify files");
    for await (const _delta of manager.transport(provider).run({
      instructions: "Generate a quiz",
      input: "Topic",
      schema: { type: "object", properties: {} },
    })) {
      /* structured generation */
    }
    const structured = JSON.parse(
      await readFile(join(home, "instructions.json"), "utf8"),
    );
    expect(structured.value).toContain("JSON Schema");
    expect(structured.value).toContain('"type":"object"');
    expect(await Bun.file(join(home, "created-session")).exists()).toBe(true);
    expect(await Bun.file(join(home, "deleted-session")).exists()).toBe(false);
    const controller = new AbortController();
    const waiting = (async () => {
      for await (const _delta of manager
        .transport(provider)
        .run({ instructions: "", input: "WAIT", signal: controller.signal })) {
        /* fixture waits */
      }
    })();
    setTimeout(() => controller.abort(), 150);
    await expect(waiting).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
