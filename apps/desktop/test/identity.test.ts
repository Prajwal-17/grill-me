import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopIdentity } from "../src/identity";
import { backendEnvironment } from "../src/config";
import { createSettingsService } from "@repo/backend/local/settings";
import { memorySecretStore } from "../../../packages/backend/test/fixtures/memory-secret-store";

test("macOS bundle names match Electron Builder executable names in both editions", async () => {
  const base = Bun.YAML.parse(
    await Bun.file(new URL("../electron-builder.yml", import.meta.url)).text(),
  ) as { executableName: string; productName: string; appId: string };
  const development = Bun.YAML.parse(
    await Bun.file(
      new URL("../electron-builder.dev.yml", import.meta.url),
    ).text(),
  ) as { executableName: string; productName: string; appId: string };
  for (const [channel, config] of [
    ["production", base],
    ["development", development],
  ] as const) {
    const identity = desktopIdentity(channel);
    expect(identity.executableName).toBe(config.executableName);
    expect(identity.productName).toBe(config.productName);
    expect(identity.appId).toBe(config.appId);
  }
  expect(desktopIdentity("production").executableName + ".app").toBe(
    "grill-me.app",
  );
  expect(desktopIdentity("development").executableName + ".app").toBe(
    "grill-me-dev.app",
  );
});

test("development and production have separate persistent identities and settings", async () => {
  const dev = desktopIdentity("development");
  const prod = desktopIdentity("production");
  for (const key of [
    "appId",
    "productName",
    "dataDirectory",
    "partition",
    "storageKey",
  ] as const)
    expect(dev[key]).not.toBe(prod[key]);
  expect(dev.dataDirectory).toBe("grill-me-desktop-dev");
  expect(() => desktopIdentity("invalid" as "production")).toThrow();
  const root = await mkdtemp(join(tmpdir(), "grill-editions-"));
  const services = [];
  try {
    for (const identity of [dev, prod]) {
      const dataRoot = join(root, identity.dataDirectory);
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dataRoot);
      const env = backendEnvironment({
        channel: identity.channel,
        dataRoot,
        token: "fixture-token",
        port: 0,
        rendererRoot: "/renderer",
        settings: {},
        inherited: {
          GRILL_ME_HOME: "/forbidden",
          APP_ENV: "production",
          GRILL_DESKTOP_CHANNEL: "production",
        },
      });
      expect(env.APP_ENV).toBe(identity.channel);
      expect(env.GRILL_DESKTOP_CHANNEL).toBe(identity.channel);
      expect(env.GRILL_ME_SQLITE_PATH).toBe(join(dataRoot, "grill-me.sqlite"));
      const service = createSettingsService(dataRoot, {
        keyring: memorySecretStore(),
      });
      services.push(service);
      await service.saveProvider({
        id: crypto.randomUUID(),
        name: identity.productName,
        endpoint: "http://127.0.0.1:1/v1",
        model: "fixture",
        storage: "keyring",
      });
    }
    expect((await services[0]!.get()).providers.map((p) => p.name)).toEqual([
      dev.productName,
    ]);
    expect((await services[1]!.get()).providers.map((p) => p.name)).toEqual([
      prod.productName,
    ]);
  } finally {
    for (const service of services) service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("production desktop boots an isolated SQLite runtime without production database access", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-prod-runtime-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        "-e",
        `
      const { startLocalServer } = await import("@repo/backend/local/server");
      const runtime = await startLocalServer({dataRoot:process.env.GRILL_ME_HOME, token:"fixture-production-token-123456789012345", origins:["grill-me://app"]});
      await runtime.stop();
      console.log("production-sqlite-ready");
    `,
      ],
      {
        cwd: join(import.meta.dir, ".."),
        env: backendEnvironment({
          channel: "production",
          dataRoot: root,
          token: "fixture",
          port: 0,
          rendererRoot: "",
          settings: {},
        }),
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
    expect(output).toContain("production-sqlite-ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
