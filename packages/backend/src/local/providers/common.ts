import { spawn } from "node:child_process";
import { mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import type { Provider } from "@repo/contracts";
import { AppError } from "../../shared/errors/app-error";
export type GenerationInput = {
  instructions: string;
  input: string;
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  workspace?: string;
  model?: string;
};
export type TextTransport = {
  run(input: GenerationInput): AsyncIterable<string>;
};
export function providerError(error: unknown, kind: string): AppError {
  if (error instanceof AppError) return error;
  const details =
    error && typeof error === "object"
      ? (error as {
          code?: unknown;
          data?: { statusCode?: number; codexErrorInfo?: unknown };
          statusCode?: number;
          codexErrorInfo?: unknown;
        })
      : {};
  const status = details.statusCode ?? details.data?.statusCode;
  const info = details.codexErrorInfo ?? details.data?.codexErrorInfo;
  if (
    status === 429 ||
    ["usageLimitExceeded", "rateLimitExceeded", "rateLimitReached"].includes(
      String(info),
    )
  )
    return new AppError(
      "PROVIDER_RATE_LIMIT",
      `${kind} has reached an account usage limit. Check the account allowance before retrying.`,
      429,
      true,
    );
  if (status === 401 || status === 403)
    return new AppError(
      "PROVIDER_AUTH_REQUIRED",
      `Sign in to ${kind} again in Settings.`,
      503,
    );
  if (details.code === -32601 || error instanceof SyntaxError)
    return new AppError(
      "CLI_INCOMPATIBLE",
      `${kind} does not support the required protocol. Update the installed CLI and reconnect.`,
      503,
    );
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
    return new AppError(
      error.name === "AbortError" ? "REQUEST_CANCELLED" : "PROVIDER_TIMEOUT",
      error.name === "AbortError"
        ? "The request was stopped. Your saved conversation is available."
        : `${kind} did not respond in time. Reconnect or retry the saved request.`,
      503,
      true,
    );
  // Never send raw stderr/protocol errors (which may contain credentials) to clients.
  return new AppError(
    "PROVIDER_CONNECTION_FAILED",
    `${kind} could not finish the request. Check its connection and sign-in status in Settings, then retry.`,
    503,
    true,
  );
}
export async function providerEnvironment(
  root: string,
  provider: Pick<Provider, "id" | "kind">,
) {
  const home = join(root, "providers", provider.id);
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "TZ",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
  ])
    if (process.env[key]) env[key] = process.env[key];
  for (const dir of [
    home,
    join(home, "config"),
    join(home, "data"),
    join(home, "state"),
    join(home, "cache"),
    join(home, "workspace"),
    join(home, "tmp"),
  ]) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
  }
  Object.assign(env, {
    TMPDIR: join(home, "tmp"),
    CODEX_HOME: join(home, "config"),
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    XDG_CACHE_HOME: join(home, "cache"),
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
  });
  return { env, workspace: join(home, "workspace") };
}
export async function executable(
  provider: Provider,
  env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME },
) {
  const path = Bun.which(provider.binaryPath || provider.kind);
  if (!path)
    throw new AppError(
      "CLI_NOT_INSTALLED",
      `Could not find ${provider.kind}. Install it on your machine or choose its executable in Settings.`,
      503,
    );
  const version = await new Promise<string>((resolve, reject) => {
    const child = spawn(path, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      env,
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new AppError(
          "PROVIDER_TIMEOUT",
          "The CLI version check timed out.",
          503,
          true,
        ),
      );
    }, 10000);
    child.stdout.on("data", (chunk) => {
      if (output.length < 4096)
        output += String(chunk).slice(0, 4096 - output.length);
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(
        new AppError(
          "CLI_NOT_EXECUTABLE",
          "The selected CLI could not start. Check its executable path and permissions.",
          503,
        ),
      );
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && /\d+\.\d+/.test(output)) resolve(output.trim());
      else
        reject(
          new AppError(
            "CLI_INCOMPATIBLE",
            "The selected executable did not return a supported CLI version.",
            503,
          ),
        );
    });
  });
  return { path, version };
}
/** A bounded producer/consumer queue; completion and cancellation always settle readers. */
export class TextQueue {
  private values: string[] = [];
  private bytes = 0;
  private done = false;
  private error: unknown;
  private wake?: () => void;
  push(text: string) {
    if (this.done || !text) return;
    this.bytes += Buffer.byteLength(text);
    if (this.bytes > 4 * 1024 * 1024) {
      this.fail(
        new AppError(
          "PROVIDER_OUTPUT_TOO_LARGE",
          "The response exceeded the local output limit.",
          502,
        ),
      );
      return;
    }
    this.values.push(text);
    this.wake?.();
  }
  end() {
    this.done = true;
    this.wake?.();
  }
  fail(error: unknown) {
    this.error = error;
    this.end();
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      while (this.values.length) {
        const text = this.values.shift()!;
        this.bytes -= Buffer.byteLength(text);
        yield text;
      }
      if (this.done) {
        if (this.error) throw this.error;
        return;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}
