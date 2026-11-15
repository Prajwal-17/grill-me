import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { AppError } from "../../shared/errors/app-error";
import { canonicalPath } from "../../shared/storage/canonical-path";
import {
  projectMetadataDirectory,
  projectRelativePath,
} from "./project-workspace";

/**
 * Limits for one project command run. Requested timeouts and output limits are
 * clamped to these hard maxima.
 */
export const projectCommandLimits = {
  commandLength: 2_000,
  cwdLength: 512,
  attemptIdLength: 200,
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 120_000,
  defaultOutputBytes: 64 * 1024,
  maxOutputBytes: 1024 * 1024,
  defaultTerminationGraceMs: 2_000,
  maxTerminationGraceMs: 5_000,
} as const;

/**
 * The exact command request the caller already authorized. `install` and
 * `network` are declarations for display and review only; this runner does not
 * install anything implicitly and does not enforce network isolation.
 */
export type ProjectCommandRequest = {
  /** Exact shell command string. It is passed to the platform shell unchanged. */
  command: string;
  /** Project-relative working directory. Defaults to the project root (`.`). */
  cwd?: string;
  /** Declares that the command may install dependencies. Not enforced. */
  install?: boolean;
  /** Declares that the command may use the network. Not enforced or blocked. */
  network?: boolean;
  /** Requested timeout. Clamped to the runner maximum. */
  timeoutMs?: number;
};

/**
 * The caller owns approval, persistence, and command review. This object only
 * records which authorization attempt the caller approved and optionally fences
 * the run against a superseded attempt.
 *
 * Use the `isCurrent` form when another task can replace the authorization while
 * the command is being prepared. Use `checked: true` only when the caller has
 * just checked the exact request and holds an immutable current attempt.
 */
export type ProjectCommandAuthorization =
  | {
      /** Stable identity of the approved authorization attempt. */
      attemptId: string;
      /**
       * Called synchronously immediately before spawn. Return true only when
       * this attempt still owns the current run. Returning false or throwing
       * rejects the command without starting a child.
       */
      isCurrent: (attemptId: string) => boolean;
    }
  | {
      /** Stable identity of the approved authorization attempt. */
      attemptId: string;
      /** The caller checked this exact request immediately before the call. */
      checked: true;
    };

export type ProjectCommandRunInput = {
  request: ProjectCommandRequest;
  authorization: ProjectCommandAuthorization;
  /** Aborting the signal terminates the command and its process group. */
  signal?: AbortSignal;
};

export type ProjectCommandStatus =
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "rejected"
  | "spawn_failed";

export type ProjectCommandFailure = {
  code: string;
  message: string;
};

/**
 * Bounded, structured result for one command attempt. Process outcomes keep
 * `error` null; rejected and spawn failures carry a safe error. This result is
 * never persisted by the runner and a failed or cancelled command is never
 * replayed automatically.
 */
export type ProjectCommandResult = {
  status: ProjectCommandStatus;
  /** False when no child process was started. */
  started: boolean;
  attemptId: string;
  /** The exact requested command, bounded for result transport. */
  command: string;
  /** The validated project-relative working directory. */
  cwd: string;
  /** Declared only. The runner does not install dependencies implicitly. */
  install: boolean;
  /** Declared only. The runner does not enforce or block network access. */
  network: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** Combined stdout and stderr in arrival order, bounded by the limit. */
  output: string;
  stdout: string;
  stderr: string;
  /** Bytes retained in `output`; never exceeds the configured limit. */
  outputBytes: number;
  /** True when stdout or stderr exceeded the combined byte limit. */
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  timeoutMs: number;
  durationMs: number;
  error: ProjectCommandFailure | null;
};

export type ProjectCommandRunnerOptions = {
  /** Absolute challenge project folder. Commands run inside this folder. */
  projectRoot: string;
  /** App-only metadata folder, outside the project, used for the isolated HOME. */
  metadataRoot: string;
  /** Default timeout when the request does not provide one. */
  defaultTimeoutMs?: number;
  /** Combined stdout/stderr byte limit. Useful mainly for tests. */
  maxOutputBytes?: number;
  /** Time between SIGTERM and SIGKILL when cancelling or timing out. */
  terminationGraceMs?: number;
};

export type ProjectCommandRunner = ReturnType<
  typeof createProjectCommandRunner
>;

const environmentAllowlist = [
  "PATH",
  "Path",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "ComSpec",
  "SystemRoot",
  "WINDIR",
  "PATHEXT",
] as const;

const runHomeDirectory = "command-runs";

function invalidConfiguration(message: string) {
  return new AppError("PROJECT_COMMAND_INVALID", message, 400);
}

function environmentUnavailable() {
  return new AppError(
    "PROJECT_COMMAND_ENVIRONMENT_UNAVAILABLE",
    "The isolated command environment could not be prepared.",
    503,
    true,
  );
}

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function inside(root: string, candidate: string) {
  const value = relative(root, candidate);
  return (
    Boolean(value) &&
    value !== ".." &&
    !value.startsWith(".." + sep) &&
    !isAbsolute(value)
  );
}

function insideOrEqual(root: string, candidate: string) {
  return root === candidate || inside(root, candidate);
}

function absoluteDirectory(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.includes("\0") ||
    !isAbsolute(value)
  )
    throw invalidConfiguration(
      `The project command ${label} must be an absolute path.`,
    );
  const resolved = resolve(value);
  if (resolved.length > 4_096 || dirname(resolved) === resolved)
    throw invalidConfiguration(
      `The project command ${label} must be a folder other than the filesystem root.`,
    );
  return resolved;
}

function boundedLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1)
    throw invalidConfiguration(
      `The project command ${label} must be a positive number.`,
    );
  return Math.min(Math.floor(value), maximum);
}

function requestedTimeout(value: unknown, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1)
    return null;
  return Math.min(Math.floor(value), projectCommandLimits.maxTimeoutMs);
}

type NormalizedAuthorization = {
  attemptId: string;
  isCurrent?: (attemptId: string) => boolean;
};

function normalizeAuthorization(
  value: unknown,
): NormalizedAuthorization | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const attemptId =
    typeof record.attemptId === "string" ? record.attemptId.trim() : "";
  if (
    !attemptId ||
    attemptId.length > projectCommandLimits.attemptIdLength ||
    attemptId.includes("\0")
  )
    return null;
  if (record.isCurrent !== undefined) {
    if (typeof record.isCurrent !== "function") return null;
    return {
      attemptId,
      isCurrent: record.isCurrent as (attemptId: string) => boolean,
    };
  }
  if (record.checked !== true) return null;
  return { attemptId };
}

function authorizationCurrent(authorization: NormalizedAuthorization) {
  if (!authorization.isCurrent) return true;
  try {
    return authorization.isCurrent(authorization.attemptId) === true;
  } catch {
    return false;
  }
}

async function resolveProjectCwd(projectRoot: string, cwd: string) {
  let projectInfo;
  try {
    projectInfo = await lstat(projectRoot);
  } catch (error) {
    if (fsCode(error) === "ENOENT")
      throw new AppError(
        "PROJECT_COMMAND_CWD_INVALID",
        "The project folder does not exist.",
        404,
      );
    throw new AppError(
      "PROJECT_COMMAND_CWD_UNAVAILABLE",
      "The project folder is unavailable.",
      503,
      true,
    );
  }
  if (projectInfo.isSymbolicLink() || !projectInfo.isDirectory())
    throw new AppError(
      "PROJECT_COMMAND_CWD_INVALID",
      "The project folder must be a real folder.",
      400,
    );

  let root: string;
  try {
    root = await canonicalPath(projectRoot);
  } catch {
    throw new AppError(
      "PROJECT_COMMAND_CWD_UNAVAILABLE",
      "The project folder is unavailable.",
      503,
      true,
    );
  }
  if (dirname(root) === root)
    throw new AppError(
      "PROJECT_COMMAND_CWD_INVALID",
      "The project folder cannot be the filesystem root.",
      400,
    );
  try {
    await access(root, constants.R_OK | constants.X_OK);
  } catch {
    throw new AppError(
      "PROJECT_COMMAND_CWD_UNAVAILABLE",
      "The project folder cannot be read.",
      503,
      true,
    );
  }
  if (cwd === ".") return { cwdPath: root, projectRootPath: root };

  let current = root;
  for (const part of cwd.split("/")) {
    current = join(current, part);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if (fsCode(error) === "ENOENT")
        throw new AppError(
          "PROJECT_COMMAND_CWD_INVALID",
          "The command working directory does not exist.",
          404,
        );
      throw new AppError(
        "PROJECT_COMMAND_CWD_UNAVAILABLE",
        "The command working directory is unavailable.",
        503,
        true,
      );
    }
    if (entry.isSymbolicLink())
      throw new AppError(
        "PROJECT_COMMAND_CWD_INVALID",
        "The command working directory cannot use symbolic links.",
        400,
      );
    if (!entry.isDirectory())
      throw new AppError(
        "PROJECT_COMMAND_CWD_INVALID",
        "The command working directory must be a folder.",
        400,
      );
  }
  try {
    await access(current, constants.R_OK | constants.X_OK);
  } catch {
    throw new AppError(
      "PROJECT_COMMAND_CWD_UNAVAILABLE",
      "The command working directory cannot be read.",
      503,
      true,
    );
  }

  let canonical: string;
  try {
    canonical = await canonicalPath(current);
  } catch {
    throw new AppError(
      "PROJECT_COMMAND_CWD_UNAVAILABLE",
      "The command working directory is unavailable.",
      503,
      true,
    );
  }
  if (canonical !== root && !inside(root, canonical))
    throw new AppError(
      "PROJECT_COMMAND_CWD_INVALID",
      "The command working directory must stay inside the project.",
      400,
    );
  return { cwdPath: canonical, projectRootPath: root };
}

async function ensureMetadataDirectory(metadataRoot: string) {
  try {
    await mkdir(metadataRoot, { recursive: true, mode: 0o700 });
    const info = await lstat(metadataRoot);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw environmentUnavailable();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw environmentUnavailable();
  }
}

async function createRunHome(metadataRoot: string, projectRoot: string) {
  await ensureMetadataDirectory(metadataRoot);
  const runsRoot = join(metadataRoot, runHomeDirectory);
  try {
    await mkdir(runsRoot, { recursive: true, mode: 0o700 });
    const info = await lstat(runsRoot);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw environmentUnavailable();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw environmentUnavailable();
  }

  let canonicalMetadata: string;
  let canonicalRuns: string;
  try {
    canonicalMetadata = await canonicalPath(metadataRoot);
    canonicalRuns = await canonicalPath(runsRoot);
  } catch {
    throw environmentUnavailable();
  }
  if (
    !inside(canonicalMetadata, canonicalRuns) ||
    insideOrEqual(projectRoot, canonicalMetadata) ||
    insideOrEqual(canonicalMetadata, projectRoot)
  )
    throw environmentUnavailable();

  let home: string;
  try {
    home = await mkdtemp(join(canonicalRuns, "run-"));
  } catch {
    throw environmentUnavailable();
  }
  try {
    const info = await lstat(home);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw environmentUnavailable();
  } catch (error) {
    await rm(home, { recursive: true, force: true }).catch(() => {});
    if (error instanceof AppError) throw error;
    throw environmentUnavailable();
  }
  return home;
}

async function removeRunHome(home: string) {
  await rm(home, { recursive: true, force: true }).catch(() => {});
}

function sensiblePath(source: NodeJS.ProcessEnv) {
  const existing = (source.PATH || source.Path || "")
    .split(delimiter)
    .filter(Boolean);
  const defaults =
    process.platform === "win32"
      ? [
          join(source.SystemRoot || "C:\\Windows", "System32"),
          source.SystemRoot || "C:\\Windows",
        ]
      : [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
        ];
  for (const directory of defaults)
    if (!existing.includes(directory)) existing.push(directory);
  return [...new Set(existing)].join(delimiter);
}

function commandEnvironment(home: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of environmentAllowlist) {
    const value = process.env[name];
    if (typeof value === "string" && value && !value.includes("\0"))
      environment[name] = value;
  }
  const path = sensiblePath(process.env);
  environment.PATH = path;
  if (process.platform === "win32") environment.Path = path;
  else delete environment.Path;
  environment.HOME = home;
  environment.TMPDIR = home;
  environment.TMP = home;
  environment.TEMP = home;
  if (process.platform === "win32") {
    environment.USERPROFILE = home;
    environment.APPDATA = join(home, "AppData", "Roaming");
    environment.LOCALAPPDATA = join(home, "AppData", "Local");
  } else {
    environment.SHELL = "/bin/sh";
    environment.XDG_CONFIG_HOME = join(home, ".config");
    environment.XDG_CACHE_HOME = join(home, ".cache");
    environment.XDG_DATA_HOME = join(home, ".local", "share");
    environment.XDG_STATE_HOME = join(home, ".local", "state");
  }
  return environment;
}

function projectShell(command: string) {
  if (process.platform === "win32") {
    const environment = process.env;
    return {
      file: environment.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  }
  return { file: "/bin/sh", args: ["-c", command] };
}

function sendProcessSignal(child: ChildProcess, signal: NodeJS.Signals) {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === "win32") {
    if (signal === "SIGKILL") {
      const environment = process.env;
      try {
        const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          env: {
            PATH: environment.PATH ?? "",
            SystemRoot: environment.SystemRoot ?? "",
          },
          stdio: "ignore",
          windowsHide: true,
        });
        killer.on("error", () => {});
        killer.unref();
      } catch {
        // Best effort only. The child may already be gone.
      }
      return;
    }
    try {
      child.kill(signal);
    } catch {
      // Best effort only. The child may already be gone.
    }
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (fsCode(error) === "ESRCH") return;
    try {
      child.kill(signal);
    } catch {
      // Best effort only. The child may already be gone.
    }
  }
}

/**
 * Create a controlled command executor for one challenge project. The caller
 * must supply an already-authorized exact request and its authorization attempt
 * identity for every run; there is no global allow switch and no default
 * permission.
 *
 * The working directory is validated to stay inside the project, including
 * nested folders, with symbolic links and app metadata rejected. That validation
 * is not a security sandbox: commands run as the local user and can still access
 * anything that user can. `install` and `network` are disclosure flags only.
 *
 * Execution is single-shot. It never retries, persists, logs, or replays a
 * command. Cancellation and timeout send SIGTERM to the child process group,
 * then SIGKILL after a grace period, including descendants left behind by the
 * shell. Output is combined and bounded; excess bytes are drained and dropped.
 */
export function createProjectCommandRunner(
  options: ProjectCommandRunnerOptions,
) {
  const projectRoot = absoluteDirectory(options.projectRoot, "project root");
  const metadataRoot = absoluteDirectory(options.metadataRoot, "metadata root");
  if (basename(projectRoot).toLowerCase() === projectMetadataDirectory)
    throw invalidConfiguration(
      "The project command root cannot be app metadata.",
    );
  if (insideOrEqual(projectRoot, metadataRoot))
    throw invalidConfiguration(
      "Project command metadata must stay outside the project root.",
    );
  if (insideOrEqual(metadataRoot, projectRoot))
    throw invalidConfiguration(
      "The project root must stay outside project command metadata.",
    );
  const defaultTimeoutMs = boundedLimit(
    options.defaultTimeoutMs,
    projectCommandLimits.defaultTimeoutMs,
    projectCommandLimits.maxTimeoutMs,
    "default timeout",
  );
  const maxOutputBytes = boundedLimit(
    options.maxOutputBytes,
    projectCommandLimits.defaultOutputBytes,
    projectCommandLimits.maxOutputBytes,
    "output limit",
  );
  const terminationGraceMs = boundedLimit(
    options.terminationGraceMs,
    projectCommandLimits.defaultTerminationGraceMs,
    projectCommandLimits.maxTerminationGraceMs,
    "termination grace",
  );

  async function run(
    input: ProjectCommandRunInput,
  ): Promise<ProjectCommandResult> {
    const startedAt = performance.now();
    const rawRequest = input?.request;
    const rawCommand =
      rawRequest && typeof rawRequest.command === "string"
        ? rawRequest.command
        : "";
    const command = rawCommand.slice(0, projectCommandLimits.commandLength);
    const rawCwd =
      rawRequest && rawRequest.cwd !== undefined ? rawRequest.cwd : ".";
    const cwd =
      typeof rawCwd === "string"
        ? rawCwd.slice(0, projectCommandLimits.cwdLength)
        : "";
    const install = rawRequest?.install === true;
    const network = rawRequest?.network === true;
    const rawAttemptId =
      input &&
      typeof input.authorization === "object" &&
      input.authorization &&
      typeof input.authorization.attemptId === "string"
        ? input.authorization.attemptId.trim()
        : "";
    const attemptId = rawAttemptId.slice(
      0,
      projectCommandLimits.attemptIdLength,
    );
    const timeout = requestedTimeout(rawRequest?.timeoutMs, defaultTimeoutMs);
    const timeoutMs = timeout ?? defaultTimeoutMs;
    const authorization = normalizeAuthorization(input?.authorization);
    const signal = input?.signal;

    function result(
      overrides: Partial<ProjectCommandResult> = {},
    ): ProjectCommandResult {
      return {
        status: "rejected",
        started: false,
        attemptId,
        command,
        cwd: cwd || ".",
        install,
        network,
        exitCode: null,
        signal: null,
        output: "",
        stdout: "",
        stderr: "",
        outputBytes: 0,
        truncated: false,
        timedOut: false,
        cancelled: false,
        timeoutMs,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        error: null,
        ...overrides,
      };
    }

    function reject(code: string, message: string) {
      return result({ status: "rejected", error: { code, message } });
    }

    function cancelledBeforeStart() {
      return result({
        status: "cancelled",
        cancelled: true,
        error: {
          code: "PROJECT_COMMAND_CANCELLED",
          message: "The command was cancelled.",
        },
      });
    }

    if (!rawRequest || typeof rawRequest !== "object")
      return reject(
        "PROJECT_COMMAND_REQUEST_INVALID",
        "The command request is invalid.",
      );
    if (
      !rawCommand.trim() ||
      rawCommand.length > projectCommandLimits.commandLength ||
      rawCommand.includes("\0")
    )
      return reject(
        "PROJECT_COMMAND_REQUEST_INVALID",
        "Enter an exact command to run.",
      );
    if (
      typeof rawCwd !== "string" ||
      !rawCwd ||
      rawCwd.length > projectCommandLimits.cwdLength
    )
      return reject(
        "PROJECT_COMMAND_CWD_INVALID",
        "The command working directory must be a project-relative path.",
      );
    if (
      (rawRequest.install !== undefined &&
        typeof rawRequest.install !== "boolean") ||
      (rawRequest.network !== undefined &&
        typeof rawRequest.network !== "boolean")
    )
      return reject(
        "PROJECT_COMMAND_REQUEST_INVALID",
        "Install and network declarations must be booleans.",
      );
    if (!timeout)
      return reject(
        "PROJECT_COMMAND_REQUEST_INVALID",
        "The command timeout must be a positive number.",
      );
    if (!authorization)
      return reject(
        "PROJECT_COMMAND_NOT_AUTHORIZED",
        "The command request is not authorized for a current attempt.",
      );
    if (rawCwd !== ".") {
      try {
        projectRelativePath(rawCwd);
      } catch (error) {
        return reject(
          "PROJECT_COMMAND_CWD_INVALID",
          error instanceof AppError
            ? error.message
            : "The command working directory is invalid.",
        );
      }
    }
    if (signal?.aborted) return cancelledBeforeStart();

    let resolvedCwd: Awaited<ReturnType<typeof resolveProjectCwd>>;
    try {
      resolvedCwd = await resolveProjectCwd(projectRoot, rawCwd);
    } catch (error) {
      if (signal?.aborted) return cancelledBeforeStart();
      if (error instanceof AppError) return reject(error.code, error.message);
      return reject(
        "PROJECT_COMMAND_CWD_UNAVAILABLE",
        "The command working directory is unavailable.",
      );
    }

    let runHome: string;
    try {
      runHome = await createRunHome(metadataRoot, resolvedCwd.projectRootPath);
    } catch (error) {
      if (signal?.aborted) return cancelledBeforeStart();
      return reject(
        "PROJECT_COMMAND_ENVIRONMENT_UNAVAILABLE",
        error instanceof AppError
          ? error.message
          : "The isolated command environment could not be prepared.",
      );
    }

    if (signal?.aborted) {
      await removeRunHome(runHome);
      return cancelledBeforeStart();
    }
    if (!authorizationCurrent(authorization)) {
      await removeRunHome(runHome);
      return reject(
        "PROJECT_COMMAND_NOT_AUTHORIZED",
        "The command approval is no longer current.",
      );
    }
    if (signal?.aborted) {
      await removeRunHome(runHome);
      return cancelledBeforeStart();
    }

    const shell = projectShell(rawCommand);
    let child: ChildProcess;
    try {
      child = spawn(shell.file, shell.args, {
        cwd: resolvedCwd.cwdPath,
        env: commandEnvironment(runHome),
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } catch {
      await removeRunHome(runHome);
      return result({
        status: "spawn_failed",
        error: {
          code: "PROJECT_COMMAND_SPAWN_FAILED",
          message: "The command could not be started.",
        },
      });
    }

    return await new Promise<ProjectCommandResult>((resolvePromise) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const outputChunks: Buffer[] = [];
      let retainedBytes = 0;
      let truncated = false;
      let started = Boolean(child.pid);
      let settled = false;
      let termination: "timeout" | "cancelled" | null = null;
      let exitCode: number | null = null;
      let exitSignal: NodeJS.Signals | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;

      function collect(target: Buffer[], chunk: Buffer) {
        const remaining = maxOutputBytes - retainedBytes;
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        const slice =
          chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        if (slice.length < chunk.length) truncated = true;
        if (!slice.length) return;
        target.push(slice);
        outputChunks.push(slice);
        retainedBytes += slice.length;
      }

      function requestTermination(reason: "timeout" | "cancelled") {
        if (settled || termination) return;
        termination = reason;
        sendProcessSignal(child, "SIGTERM");
        graceTimer = setTimeout(() => {
          graceTimer = undefined;
          sendProcessSignal(child, "SIGKILL");
        }, terminationGraceMs);
        graceTimer.unref?.();
      }

      function onAbort() {
        requestTermination("cancelled");
      }

      async function finish(
        status: ProjectCommandStatus,
        error: ProjectCommandFailure | null = null,
      ) {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (graceTimer) clearTimeout(graceTimer);
        signal?.removeEventListener("abort", onAbort);
        // The shell may have exited while a grandchild still holds the process
        // group. Kill the group even after close so descendants cannot linger.
        if (termination) sendProcessSignal(child, "SIGKILL");
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        const output = Buffer.concat(outputChunks).toString("utf8");
        await removeRunHome(runHome);
        resolvePromise(
          result({
            status,
            started,
            exitCode,
            signal: exitSignal,
            output,
            stdout,
            stderr,
            outputBytes: retainedBytes,
            truncated,
            timedOut: status === "timed_out",
            cancelled: status === "cancelled",
            error,
          }),
        );
      }

      function exitStatus(): ProjectCommandStatus {
        if (termination === "timeout") return "timed_out";
        if (termination === "cancelled") return "cancelled";
        if (exitCode === 0 && exitSignal === null) return "succeeded";
        return "failed";
      }

      child.once("spawn", () => {
        started = true;
      });
      child.once("error", () => {
        if (settled || started) return;
        void finish("spawn_failed", {
          code: "PROJECT_COMMAND_SPAWN_FAILED",
          message: "The command could not be started.",
        });
      });
      child.once("close", (code, signalName) => {
        exitCode = code;
        exitSignal = signalName;
        if (!started && code === null) {
          void finish("spawn_failed", {
            code: "PROJECT_COMMAND_SPAWN_FAILED",
            message: "The command could not be started.",
          });
          return;
        }
        void finish(exitStatus());
      });
      child.stdout?.on("data", (chunk: Buffer) => collect(stdoutChunks, chunk));
      child.stderr?.on("data", (chunk: Buffer) => collect(stderrChunks, chunk));
      child.stdout?.on("error", () => {});
      child.stderr?.on("error", () => {});

      timeoutTimer = setTimeout(() => {
        requestTermination("timeout");
      }, timeoutMs);
      timeoutTimer.unref?.();

      if (signal) {
        if (signal.aborted) requestTermination("cancelled");
        else signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  return { run };
}
