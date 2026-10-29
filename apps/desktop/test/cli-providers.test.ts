import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { providerInputSchema, providerSchema } from "@repo/contracts";
import { createCliProviders } from "../../../packages/backend/src/local/providers";
import { createSettingsService } from "../../../packages/backend/src/local/settings";
import { sessionSecretStore } from "../../../packages/backend/src/local/secrets";

test("CLI providers reuse an executable with isolated authentication, ephemeral turns, cancellation and sanitized failures", async () => {
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
    });
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
    expect(params.ephemeral).toBe(true);
    expect(params.sandbox).toBe("read-only");
    expect(params.cwd.startsWith(root)).toBe(true);
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

test("the configured local model forwards snapshot files and workspace arguments for API and CLI reviews", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-model-routing-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        resolve(import.meta.dir, "fixtures/configured-model.ts"),
      ],
      {
        env: {
          ...process.env,
          GRILL_ME_HOME: root,
          GRILL_ME_SQLITE_PATH: join(root, "test.sqlite"),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [code, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, error: code ? error : "" }).toEqual({ code: 0, error: "" });
    expect(output).toContain("Snapshot routing passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("disconnect survives a backend restart until explicit Connect or Use provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-cli-disconnect-"));
  let manager = createCliProviders(root);
  let settings = createSettingsService(root, {
    cli: manager,
    keyring: sessionSecretStore(),
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
      keyring: sessionSecretStore(),
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

test("OpenCode uses an authenticated isolated server, filters user events, enforces review permissions and removes temporary sessions", async () => {
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
    const chunks: string[] = [];
    for await (const delta of manager
      .transport(provider)
      .run({ instructions: "Review only", input: "Review this input" }))
      chunks.push(delta);
    expect(chunks.join("")).toBe("OpenCode response");
    expect(chunks.join("")).not.toContain("User text");
    const home = join(root, "providers", provider.id, "data");
    expect(await readFile(join(home, "deleted-session"), "utf8")).toBe("true");
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

test("OpenCode 2 uses integration auth, acknowledged SSE subscription, temporary sessions, and cancellation", async () => {
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
      ).models[0]?.id,
    ).toBe("fixture/fixture-model");
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
    expect(await readFile(join(home, "deleted-session"), "utf8")).toBe("true");
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
