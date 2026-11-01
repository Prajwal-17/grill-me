import { test, expect } from "bun:test";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  readdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { DesktopUpdateState } from "@repo/contracts";
import { DesktopUpdater } from "../src/updater/updater";
import { GitHubUpdates, newerVersion } from "../src/updater/github";
import {
  updateCredentialStore,
  type CredentialStore,
  type UpdateCredentials,
} from "../src/updater/credentials";
import { macInstallScript, shellQuote } from "../src/updater/install";
const token = "fixture-token-never-persist-in-plaintext";
const payload = Buffer.from("verified installer fixture");
const digest = createHash("sha256").update(payload).digest("hex");
const name = "grill-me-0.1.8-amd64.deb";
function store(): CredentialStore {
  let saved: UpdateCredentials | null = null;
  return {
    load: async () => saved,
    save: async (value) => {
      saved = value;
      return "saved-token";
    },
    clear: async () => {
      saved = null;
    },
  };
}
function fixture(input: {
  root: string;
  owner?: string;
  enabled?: boolean;
  version?: string;
  checksum?: string;
  status?: number;
  incomplete?: boolean;
  redirect?: boolean;
  publish?(state: DesktopUpdateState): void;
}) {
  const requests: { url: string; auth: string | null }[] = [];
  let installations = 0;
  const github = new GitHubUpdates((async (url, options) => {
    options?.signal?.throwIfAborted();
    const path = new URL(String(url));
    requests.push({
      url: path.href,
      auth: new Headers(options?.headers).get("Authorization"),
    });
    if (input.status)
      return Response.json({ message: token }, { status: input.status });
    if (path.pathname === "/user")
      return Response.json({ login: input.owner ?? "Prajwal-17", email: null });
    if (path.pathname.endsWith("/releases"))
      return Response.json([
        {
          tag_name: "desktop-v99.0.0",
          draft: true,
          prerelease: false,
          assets: [],
        },
        {
          tag_name: "desktop-v0.1.8",
          draft: false,
          prerelease: false,
          assets: input.incomplete
            ? []
            : [
                { id: 1, name, size: payload.length, state: "uploaded" },
                { id: 2, name: "SHA256SUMS", size: 100, state: "uploaded" },
              ],
        },
        {
          tag_name: "desktop-v100.0.0",
          draft: false,
          prerelease: true,
          assets: [],
        },
      ]);
    if (path.pathname.endsWith("/assets/2"))
      return new Response(`${input.checksum ?? digest}  ${name}\n`);
    if (path.pathname.endsWith("/assets/1") && input.redirect)
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://release-assets.githubusercontent.com/fixture/signed?token=cdn",
        },
      });
    if (
      path.pathname.endsWith("/assets/1") ||
      path.hostname === "release-assets.githubusercontent.com"
    )
      return new Response(payload);
    return Response.json({ private: true });
  }) as typeof fetch);
  const updater = new DesktopUpdater({
    root: input.root,
    version: input.version ?? "0.1.7",
    platform: "linux",
    arch: "x64",
    enabled: input.enabled ?? true,
    credentials: store(),
    github,
    ownerToken: async () => token,
    install: async () => {
      installations++;
    },
    publish: input.publish ?? (() => {}),
  });
  return { updater, requests, installed: () => installations };
}
test("private updater validates owner identity, checks stable releases, strips token on redirects, verifies and installs only on request", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-update-"));
  try {
    const { updater, requests, installed } = fixture({ root, redirect: true });
    const state = await updater.initialize();
    expect(state).toMatchObject({
      authorized: true,
      authSource: "owner-cli",
      phase: "available",
      latestVersion: "0.1.8",
    });
    expect(JSON.stringify(state)).not.toContain(token);
    expect(installed()).toBe(0);
    expect((await updater.download()).phase).toBe("downloaded");
    expect(await readFile(join(root, "updates", name))).toEqual(payload);
    expect(
      requests.find((r) =>
        r.url.includes("release-assets.githubusercontent.com"),
      )?.auth,
    ).toBeNull();
    expect(
      requests
        .filter((r) => r.url.startsWith("https://api.github.com"))
        .every((r) => r.auth === `Bearer ${token}`),
    ).toBe(true);
    await updater.install();
    expect(installed()).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("friends cannot claim owner bypass by email and failed token replacement preserves working credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-update-auth-"));
  try {
    const { updater } = fixture({ root, owner: "friend" });
    expect((await updater.initialize()).authorized).toBe(false);
    expect(
      (await updater.configure({ email: "owner@example.test" })).authorized,
    ).toBe(false);
    expect(
      (await updater.configure({ email: "friend@example.test", token }))
        .authorized,
    ).toBe(true);
    const failure = await updater.configure({ email: "bad", token: "new" });
    expect(failure.phase).toBe("error");
    expect(failure.authorized).toBe(true);
    expect((await updater.forget()).authorized).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("checksum mismatch removes partial files and a modified cached installer is never installed", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-update-hash-"));
  try {
    const bad = fixture({ root, checksum: "0".repeat(64) });
    await bad.updater.initialize();
    expect((await bad.updater.download()).message).toContain(
      "verification failed",
    );
    expect(await readdir(join(root, "updates"))).toEqual([]);
    const valid = fixture({ root });
    await valid.updater.initialize();
    await valid.updater.download();
    await writeFile(join(root, "updates", name), "altered");
    expect((await valid.updater.install()).phase).toBe("error");
    expect(valid.installed()).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("release selection prevents downgrades and incomplete releases, and development builds cannot download", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-update-release-"));
  try {
    const current = fixture({ root, version: "0.1.8" });
    expect((await current.updater.initialize()).latestVersion).toBeUndefined();
    const incomplete = fixture({ root, incomplete: true });
    expect((await incomplete.updater.initialize()).message).toContain(
      "still publishing",
    );
    const dev = fixture({ root, enabled: false });
    await dev.updater.initialize();
    expect((await dev.updater.download()).phase).toBe("error");
    expect(dev.installed()).toBe(0);
    expect(newerVersion("desktop-v0.1.10", "0.1.9")).toBe(true);
    expect(newerVersion("desktop-v0.1.8-beta", "0.1.7")).toBe(false);
    expect(newerVersion("desktop-v0.1.6", "0.1.7")).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("invalid or revoked tokens and denied access do not expose server responses", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-update-errors-"));
  try {
    for (const status of [401, 403, 404, 500]) {
      const { updater } = fixture({ root, status });
      const result = await updater.configure({
        email: "friend@example.test",
        token,
      });
      expect(result.phase).toBe("error");
      expect(result.authorized).toBe(false);
      expect(JSON.stringify(result)).not.toContain(token);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("cancelling a download leaves no partial installer and permits retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-update-cancel-"));
  try {
    let cancel = true;
    const { updater, installed } = fixture({
      root,
      publish: (state) => {
        if (cancel && state.phase === "downloading") updater.cancel();
      },
    });
    await updater.initialize();
    expect((await updater.download()).phase).toBe("available");
    expect(await readdir(join(root, "updates"))).toEqual([]);
    cancel = false;
    expect((await updater.download()).phase).toBe("downloaded");
    expect(installed()).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("asset redirects cannot send credentials to an arbitrary host or an insecure URL", async () => {
  for (const location of [
    "https://evil.example/file",
    "http://release-assets.githubusercontent.com/file",
    "https://user:pass@release-assets.githubusercontent.com/file",
  ]) {
    let requests = 0;
    const github = new GitHubUpdates((async () => {
      requests++;
      return new Response(null, { status: 302, headers: { location } });
    }) as unknown as typeof fetch);
    await expect(github.asset(1, token)).rejects.toThrow(
      "untrusted asset address",
    );
    expect(requests).toBe(1);
  }
});
test("credentials are encrypted with owner-only permissions, or kept only in memory without a secure OS store", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-update-store-"));
  const crypto = {
    available: () => true,
    encrypt: (value: string) => Buffer.from(value.split("").reverse().join("")),
    decrypt: (value: Buffer) => value.toString().split("").reverse().join(""),
  };
  try {
    let credentials = updateCredentialStore(root, crypto);
    expect(
      await credentials.save({ email: "friend@example.test", token }),
    ).toBe("saved-token");
    const path = join(root, "update-credentials.json");
    expect((await readFile(path, "utf8")).includes(token)).toBe(false);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    credentials = updateCredentialStore(root, crypto);
    expect((await credentials.load())?.token).toBe(token);
    credentials = updateCredentialStore(root, {
      ...crypto,
      available: () => false,
    });
    expect(
      await credentials.save({ email: "friend@example.test", token }),
    ).toBe("session-token");
    expect(await Bun.file(path).exists()).toBe(false);
    expect(await updateCredentialStore(root, crypto).load()).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("macOS helper quotes paths, waits for the old process, and retains a rollback copy without credentials", () => {
  const script = macInstallScript({
    pid: 123,
    source: "/tmp/O'Brien/Grill Me.app",
    destination: "/Applications/Grill Me.app",
    stage: "/tmp/update stage",
    log: "/tmp/update.log",
  });
  expect(script).toContain(shellQuote("/tmp/O'Brien/Grill Me.app"));
  expect(script).toContain("kill -0 123");
  expect(script).toContain("grill-update-backup");
  expect(script).not.toContain(token);
  execFileSync("/bin/sh", ["-n"], { input: script });
});
