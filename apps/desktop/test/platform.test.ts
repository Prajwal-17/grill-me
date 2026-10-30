import { expect, test } from "bun:test";
import { buildTarget } from "../src/build-target";
import { executablePath } from "@repo/backend/local/executable-path";
import { nativeSecretStore } from "@repo/backend/local/secrets";
import { entries } from "./fixtures/keyring";

test("native targets reject unsupported and cross-architecture builds", () => {
  for (const [platform, arch] of [
    ["linux", "x64"],
    ["darwin", "x64"],
    ["darwin", "arm64"],
  ]) {
    const target = buildTarget(platform!, arch!, platform!, arch!);
    expect(target.nativeName).toContain(`${platform}-${arch}`);
  }
  expect(() => buildTarget("darwin", "arm64", "darwin", "x64")).toThrow(
    "matching native host",
  );
  expect(() => buildTarget("win32", "x64")).toThrow("Unsupported");
  expect(() => buildTarget("darwin", "universal")).toThrow("Unsupported");
});

test("Finder PATH preserves inherited priority and adds Homebrew and user installations", () => {
  const paths = executablePath(
    { HOME: "/Users/fixture", PATH: "/custom/bin:/usr/bin" },
    "darwin",
  ).split(":");
  expect(paths[0]).toBe("/custom/bin");
  for (const path of [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/Users/fixture/.bun/bin",
    "/Users/fixture/.opencode/bin",
    "/Users/fixture/.local/bin",
  ])
    expect(paths).toContain(path);
  expect(executablePath({ PATH: "/linux/custom" }, "linux")).toBe(
    "/linux/custom",
  );
});

test("native credential adapter preserves namespace and uses platform options", async () => {
  entries.length = 0;
  const store = nativeSecretStore(
    "/fixture/data",
    new URL("./fixtures/keyring.ts", import.meta.url).pathname,
  );
  await store.set("fixture-key", "secret");
  expect(await store.get("fixture-key")).toBe("secret");
  expect(entries[0]!.service).toMatch(/^grill-me-dev\.[a-f0-9]{24}$/);
  expect(entries[0]!.options).toEqual(
    process.platform === "linux"
      ? { linux: { store: "secret-service" } }
      : undefined,
  );
  await store.remove("fixture-key");
  expect(await store.get("fixture-key")).toBeUndefined();
});

test("unavailable native storage reports failure and never accepts a persistent key", async () => {
  const store = nativeSecretStore(
    "/fixture/unavailable",
    "/missing/grill-keyring-binding.js",
  );
  expect((await store.status()).available).toBe(false);
  await expect(store.set("fixture-key", "secret")).rejects.toThrow();
  await expect(store.get("fixture-key")).rejects.toThrow();
});
