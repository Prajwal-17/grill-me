import { createHash } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { DesktopUpdateState } from "@repo/contracts";
import { updateCredentialsSchema } from "@repo/contracts";
import type { CredentialStore, UpdateCredentials } from "./credentials";
import {
  GitHubUpdates,
  UpdateError,
  newerVersion,
  type UpdateRelease,
} from "./github";

type Options = {
  root: string;
  version: string;
  platform: "linux" | "darwin";
  arch: string;
  enabled: boolean;
  credentials: CredentialStore;
  github?: GitHubUpdates;
  ownerToken(): Promise<string | null>;
  install(path: string, version: string): Promise<void>;
  publish(state: DesktopUpdateState): void;
};
export class DesktopUpdater {
  private state: DesktopUpdateState;
  private github: GitHubUpdates;
  private credentials: UpdateCredentials | null = null;
  private release: UpdateRelease | null = null;
  private downloaded: { path: string; sha256: string; version: string } | null =
    null;
  private controller: AbortController | null = null;
  private busy = false;
  constructor(private options: Options) {
    this.github = options.github ?? new GitHubUpdates();
    this.state = {
      enabled: options.enabled,
      currentVersion: options.version,
      authorized: false,
      authSource: null,
      email: null,
      phase: "idle",
      message: "Enter a read-only GitHub token to enable private updates.",
    };
  }
  snapshot(): DesktopUpdateState {
    return { ...this.state };
  }
  private set(patch: Partial<DesktopUpdateState>) {
    this.state = { ...this.state, ...patch };
    this.options.publish(this.snapshot());
  }
  private async action(work: () => Promise<void>) {
    if (this.busy) return this.snapshot();
    this.busy = true;
    try {
      await work();
    } catch (error) {
      const message =
        error instanceof UpdateError
          ? error.message
          : error instanceof Error && error.name === "TimeoutError"
            ? "The update request timed out. Check your connection and retry."
            : "Could not complete the update. Check your network and available disk space, then retry.";
      this.set({
        phase: "error",
        message,
        ...(error instanceof UpdateError && error.auth
          ? { authorized: false }
          : {}),
      });
    } finally {
      this.busy = false;
    }
    return this.snapshot();
  }
  async initialize() {
    if (!this.options.enabled) {
      this.set({
        message:
          "Private updates are available in the installed production app.",
      });
      return this.snapshot();
    }
    try {
      this.credentials = await this.options.credentials.load();
      if (this.credentials)
        this.set({
          authorized: true,
          authSource: "saved-token",
          email: this.credentials.email,
          message: "Private updates connected.",
        });
    } catch {
      this.set({
        message:
          "Cannot unlock the saved update token. Unlock your credential store, or connect again.",
      });
    }
    if (!this.credentials) {
      try {
        const token = await this.options.ownerToken();
        if (token) {
          const user = await this.github.validate(token, true);
          this.credentials = { token, email: user.email ?? "" };
          this.set({
            authorized: true,
            authSource: "owner-cli",
            email: user.email ?? null,
            message: "Using the repository owner's GitHub CLI login.",
          });
        }
      } catch {
        this.set({
          message:
            "Enter an update token, or sign into the owner account using GitHub CLI.",
        });
      }
    }
    if (this.state.authorized && this.options.enabled) await this.check();
    return this.snapshot();
  }
  async configure(input: unknown) {
    const state = await this.action(async () => {
      const parsed = updateCredentialsSchema.safeParse(input);
      if (!parsed.success)
        throw new UpdateError(
          "Enter a valid email and a single-line GitHub token.",
        );
      this.set({
        phase: "checking",
        message: "Verifying private repository access…",
      });
      const token = parsed.data.token ?? (await this.options.ownerToken());
      if (!token)
        throw new UpdateError(
          "Enter a read-only GitHub token. The owner can instead run gh auth login on this machine.",
        );
      await this.github.validate(token, !parsed.data.token);
      const value = { email: parsed.data.email, token };
      const source = parsed.data.token
        ? await this.options.credentials.save(value)
        : "owner-cli";
      this.credentials = value;
      this.release = null;
      this.downloaded = null;
      this.set({
        authorized: true,
        email: value.email,
        authSource: source,
        phase: "idle",
        latestVersion: undefined,
        progress: undefined,
        message:
          source === "session-token"
            ? "Connected for this session. Unlock your system credential store to save the token across restarts."
            : "Private updates connected.",
      });
    });
    if (state.authorized && state.phase === "idle" && this.options.enabled)
      return this.check();
    return state;
  }
  forget() {
    return this.action(async () => {
      await this.options.credentials.clear();
      this.credentials = null;
      this.release = null;
      this.downloaded = null;
      await rm(join(this.options.root, "updates"), {
        recursive: true,
        force: true,
      });
      this.set({
        authorized: false,
        authSource: null,
        email: null,
        latestVersion: undefined,
        progress: undefined,
        phase: "idle",
        message:
          "Update token removed from this app. Existing practice is unchanged.",
      });
    });
  }
  private token() {
    if (!this.credentials || !this.state.authorized)
      throw new UpdateError(
        "Connect private updates in Settings → About.",
        true,
      );
    return this.credentials.token;
  }
  private assetName(version: string) {
    if (this.options.platform === "linux" && this.options.arch === "x64")
      return `grill-me-${version}-amd64.deb`;
    if (
      this.options.platform === "darwin" &&
      ["x64", "arm64"].includes(this.options.arch)
    )
      return `grill-me-${version}-mac-${this.options.arch}.dmg`;
    throw new UpdateError(
      "This platform does not have a supported update installer.",
    );
  }
  check() {
    return this.action(async () => {
      if (!this.options.enabled)
        throw new UpdateError(
          "Install the production app to use automatic updates. Development builds never install production releases.",
        );
      const token = this.token();
      if (this.downloaded) {
        this.set({
          phase: "downloaded",
          message:
            "Update downloaded and verified. Restart when you are ready.",
        });
        return;
      }
      this.set({
        phase: "checking",
        message: "Checking private GitHub releases…",
        progress: undefined,
      });
      const release = await this.github.latest(token);
      if (!release || !newerVersion(release.tag_name, this.options.version)) {
        this.release = null;
        this.set({
          phase: "idle",
          latestVersion: undefined,
          message: "You are using the latest version.",
        });
        return;
      }
      const version = release.tag_name.slice("desktop-v".length);
      const expected = [this.assetName(version), "SHA256SUMS"];
      if (
        !expected.every((name) =>
          release.assets.some(
            (asset) =>
              asset.name === name &&
              asset.state === "uploaded" &&
              asset.size > 0,
          ),
        )
      )
        throw new UpdateError(
          "The new release is still publishing its installers. Check again shortly.",
        );
      this.release = release;
      this.set({
        phase: "available",
        latestVersion: version,
        message: `Grill Me ${version} is available.`,
      });
    });
  }
  download() {
    return this.action(async () => {
      if (!this.options.enabled)
        throw new UpdateError(
          "Updates are only installed by the production app.",
        );
      const token = this.token();
      if (!this.release || !this.state.latestVersion)
        throw new UpdateError("Check for updates before downloading.");
      const version = this.state.latestVersion;
      const name = this.assetName(version);
      const asset = this.release.assets.find((a) => a.name === name)!;
      const checksumAsset = this.release.assets.find(
        (a) => a.name === "SHA256SUMS",
      )!;
      if (asset.size > 2 * 1024 ** 3 || checksumAsset.size > 65536)
        throw new UpdateError("The release contains an invalid update size.");
      const controller = new AbortController();
      this.controller = controller;
      const directory = join(this.options.root, "updates");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, name);
      const partial = path + ".part";
      this.set({
        phase: "downloading",
        progress: 0,
        message: "Downloading update… You can keep using the app.",
      });
      try {
        const checksumResponse = await this.github.asset(
          checksumAsset.id,
          token,
          controller.signal,
        );
        if (!checksumResponse.body)
          throw new UpdateError("GitHub returned an empty checksum file.");
        const chunks: Uint8Array[] = [];
        let sumBytes = 0;
        for await (const chunk of checksumResponse.body) {
          sumBytes += chunk.byteLength;
          if (sumBytes > 65536)
            throw new UpdateError("Invalid update checksum file.");
          chunks.push(chunk);
        }
        const sums = Buffer.concat(chunks).toString("utf8");
        const expected = sums
          .split(/\r?\n/)
          .map((line) => /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line))
          .filter((entry) => entry?.[2] === name);
        if (expected.length !== 1)
          throw new UpdateError(
            "The installer checksum is missing or ambiguous. Wait for a corrected release.",
          );
        const response = await this.github.asset(
          asset.id,
          token,
          controller.signal,
        );
        if (!response.body)
          throw new UpdateError("GitHub returned an empty installer.");
        await rm(partial, { force: true });
        const file = await open(partial, "wx", 0o600);
        const hash = createHash("sha256");
        let bytes = 0,
          lastProgress = -1;
        try {
          for await (const chunk of response.body) {
            controller.signal.throwIfAborted();
            bytes += chunk.byteLength;
            if (bytes > asset.size)
              throw new UpdateError(
                "The installer size does not match its release metadata.",
              );
            hash.update(chunk);
            await file.writeFile(chunk);
            const progress = Math.floor((bytes / asset.size) * 100);
            if (progress !== lastProgress) {
              lastProgress = progress;
              this.set({ progress });
            }
          }
        } finally {
          await file.close();
        }
        const sha256 = hash.digest("hex");
        if (bytes !== asset.size || sha256 !== expected[0]![1])
          throw new UpdateError(
            "Update verification failed. The incomplete or altered download was removed. Retry the download.",
          );
        const { rename } = await import("node:fs/promises");
        await rename(partial, path);
        this.downloaded = { path, sha256, version };
        this.set({
          phase: "downloaded",
          progress: 100,
          message:
            "Update downloaded and verified. Restart when you are ready.",
        });
      } catch (error) {
        await rm(partial, { force: true });
        if (controller.signal.aborted) {
          this.set({
            phase: "available",
            progress: undefined,
            message: "Download cancelled. You can download the update later.",
          });
          return;
        }
        this.set({ progress: undefined });
        throw error;
      } finally {
        this.controller = null;
      }
    });
  }
  cancel() {
    this.controller?.abort();
    return this.snapshot();
  }
  install() {
    return this.action(async () => {
      if (!this.options.enabled || !this.downloaded)
        throw new UpdateError(
          "Download and verify an update before installing it.",
        );
      const { path, sha256, version } = this.downloaded;
      const hash = createHash("sha256");
      try {
        for await (const chunk of createReadStream(path)) hash.update(chunk);
      } catch {
        this.downloaded = null;
        this.set({ progress: undefined });
        throw new UpdateError(
          "The downloaded installer is missing or unreadable. Download it again before installing.",
        );
      }
      const currentHash = hash.digest("hex");
      if (sha256 !== currentHash) {
        this.downloaded = null;
        await rm(path, { force: true });
        this.set({ progress: undefined });
        throw new UpdateError(
          "The downloaded installer changed. Download it again before installing.",
        );
      }
      this.set({
        phase: "installing",
        message:
          "Installing update… Approve the operating system prompt if requested.",
      });
      await this.options.install(path, version);
    });
  }
}
