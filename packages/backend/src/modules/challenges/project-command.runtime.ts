import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  ProjectCommand,
  ProjectCommandResult,
  ProjectCommandStatus,
  ProjectFrozenSpecification,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import type { ProjectLayout } from "./project-workspace";
import { projectPreparationModel } from "./project-preparation.model";
import {
  maxActiveProjectCommands,
  maxProjectCommandRecords,
  projectCommandAuthorizationFromRow,
  projectCommandFromRow,
  projectCommandModel,
  type ProjectCommandAuthorizationRow,
  type ProjectCommandRow,
} from "./project-command.model";
import {
  createProjectCommandRunner,
  projectCommandLimits,
  type ProjectCommandRunner,
} from "./project-command-runner";
import {
  projectCommandToolRequestSchema,
  type ProjectCommandExecutor,
  type ProjectCommandToolRequest,
  type ProjectCommandToolResult,
} from "./project-command.types";

export function projectSpecificationHash(
  specification: ProjectFrozenSpecification,
) {
  return createHash("sha256")
    .update(JSON.stringify(specification))
    .digest("hex");
}

function invalid(message: string) {
  return new AppError("PROJECT_COMMAND_INVALID", message, 400);
}

function stale() {
  return new AppError(
    "PROJECT_COMMAND_STALE",
    "This command approval is no longer current. The preparation attempt, run, or frozen specification changed, so the command was not run.",
    409,
  );
}

function recordFailed() {
  return new AppError(
    "PROJECT_COMMAND_RECORD_FAILED",
    "The command approval could not be saved, so no command was started.",
    503,
    true,
  );
}

function cancelledError() {
  return new AppError(
    "REQUEST_CANCELLED",
    "Project preparation was cancelled.",
    499,
  );
}

function covers(
  authorization: ProjectCommandAuthorizationRow | undefined,
  session: CommandSession,
  request: ProjectCommandToolRequest,
) {
  return Boolean(
    authorization &&
    authorization.preparationId === session.preparationId &&
    authorization.runToken === session.runToken &&
    authorization.specificationHash === session.specificationHash &&
    (!request.install || authorization.install) &&
    (!request.network || authorization.network),
  );
}

function resultForTool(row: ProjectCommandRow): ProjectCommandToolResult {
  return {
    id: row.id,
    purpose: row.purpose,
    checkId: row.checkId ?? null,
    status: row.status,
    authorization: row.authorization ?? null,
    command: row.command,
    cwd: row.cwd,
    install: row.install,
    network: row.network,
    timeoutMs: row.timeoutMs,
    result: row.result ?? null,
  };
}

function persistedStatus(
  status: ProjectCommandResult["status"],
): Exclude<
  ProjectCommandStatus,
  "pending" | "approved" | "running" | "interrupted"
> {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "timed_out":
      return "timed_out";
    case "cancelled":
      return "cancelled";
    case "rejected":
      return "rejected";
    case "failed":
    case "spawn_failed":
      return "failed";
  }
}

function boundedResult(
  value: Awaited<ReturnType<ProjectCommandRunner["run"]>>,
): ProjectCommandResult {
  return {
    status: value.status,
    started: value.started,
    exitCode: value.exitCode,
    signal: value.signal,
    output: value.output.slice(0, 131_072),
    outputBytes: value.outputBytes,
    truncated: value.truncated,
    timedOut: value.timedOut,
    cancelled: value.cancelled,
    durationMs: value.durationMs,
    error: value.error
      ? {
          code: value.error.code.slice(0, 160),
          message: value.error.message.slice(0, 1_000),
        }
      : null,
  };
}

type CommandSession = {
  preparationId: string;
  profileId: string;
  challengeId: string;
  attempt: number;
  specificationHash: string;
  runToken: string;
  layout: ProjectLayout;
  runner: ProjectCommandRunner;
  signal?: AbortSignal;
  active: boolean;
  commandIds: Set<string>;
};

export type ProjectCommandRun = {
  execute: ProjectCommandExecutor;
  results: () => Promise<ProjectCommand[]>;
  end: () => Promise<void>;
};

type Waiter = {
  promise: Promise<void>;
  wake: () => void;
};

/**
 * Persisted authorization and execution state for scaffold commands. All
 * writes are workflow state only; there is no diagnostic logging, tracing, or
 * command replay. A fresh runtime starts with no active sessions, so commands
 * left pending or running by a previous process are recovered as interrupted
 * and can never be claimed again.
 */
export function createProjectCommandRuntime(
  dependencies: { now?: () => Date } = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const sessions = new Map<string, CommandSession>();
  const waiters = new Map<string, Set<() => void>>();

  function wake(commandId: string) {
    const pending = waiters.get(commandId);
    if (!pending) return;
    for (const resolve of [...pending]) resolve();
    waiters.delete(commandId);
  }

  function wakeRows(rows: { id: string }[]) {
    for (const row of rows) wake(row.id);
  }

  function registerWaiter(commandId: string, signal?: AbortSignal): Waiter {
    let done = false;
    let resolve!: () => void;
    const promise = new Promise<void>((settle) => {
      resolve = settle;
    });
    const wake = () => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", wake);
      const pending = waiters.get(commandId);
      pending?.delete(wake);
      if (pending && !pending.size) waiters.delete(commandId);
      resolve();
    };
    const pending = waiters.get(commandId) ?? new Set<() => void>();
    pending.add(wake);
    waiters.set(commandId, pending);
    if (signal?.aborted) wake();
    else signal?.addEventListener("abort", wake, { once: true });
    return { promise, wake };
  }

  async function execute(
    session: CommandSession,
    rawRequest: ProjectCommandToolRequest,
  ): Promise<ProjectCommandToolResult> {
    let request: ProjectCommandToolRequest;
    try {
      request = projectCommandToolRequestSchema.parse(rawRequest);
    } catch (error) {
      throw invalid(
        error instanceof z.ZodError
          ? z.prettifyError(error).split("\n").slice(0, 8).join(" ")
          : "The command request is invalid.",
      );
    }
    if (request.purpose === "check" && !request.checkId)
      throw invalid(
        "A check command needs the final check ID so its real result can be validated.",
      );
    if (request.purpose !== "check" && request.checkId)
      throw invalid("Only check commands can carry a check ID.");
    if (!session.active || session.signal?.aborted) throw cancelledError();

    const current = await projectPreparationModel.runningByToken(
      session.preparationId,
      session.runToken,
    );
    if (!current) throw stale();
    const accepted = projectSpecificationHash(current.specification);
    if (accepted !== session.specificationHash) throw stale();

    const active = await projectCommandModel.countActive(session.preparationId);
    if (Number(active?.count ?? 0) >= maxActiveProjectCommands)
      throw new AppError(
        "PROJECT_COMMAND_LIMIT_REACHED",
        "Too many commands are waiting for authorization. Finish or cancel the current command first.",
        409,
      );

    const authorization = await projectCommandModel.authorization(
      session.preparationId,
    );
    const authorizedByAttempt = covers(authorization, session, request);
    const timeoutMs =
      request.timeoutMs ?? projectCommandLimits.defaultTimeoutMs;
    let row = await projectCommandModel.create({
      id: crypto.randomUUID(),
      profileId: session.profileId,
      challengeId: session.challengeId,
      preparationId: session.preparationId,
      attempt: session.attempt,
      specificationHash: session.specificationHash,
      runToken: session.runToken,
      purpose: request.purpose,
      checkId: request.checkId ?? null,
      command: request.command,
      cwd: request.cwd,
      install: request.install,
      network: request.network,
      timeoutMs,
      status: authorizedByAttempt ? "approved" : "pending",
      authorization: authorizedByAttempt ? "attempt" : null,
      at: now(),
    });
    if (!row) throw recordFailed();
    session.commandIds.add(row.id);

    if (row.status === "pending") {
      const waiter = registerWaiter(row.id, session.signal);
      // A concurrent attempt-wide authorization may have arrived after the
      // first read but before this row existed. Re-check and re-read the row.
      const refreshed = await projectCommandModel.authorization(
        session.preparationId,
      );
      if (covers(refreshed, session, request)) {
        const approved = await projectCommandModel.decide({
          id: row.id,
          preparationId: session.preparationId,
          runToken: session.runToken,
          status: "approved",
          authorization: "attempt",
          at: now(),
        });
        if (approved) row = approved;
      }
      const latest = await projectCommandModel.byId(row.id);
      if (latest?.status !== "pending") waiter.wake();
      await waiter.promise;
      waiter.wake();
      row = (await projectCommandModel.byId(row.id)) ?? row;
    }

    if (!session.active || session.signal?.aborted) {
      await projectCommandModel
        .interruptPreparation(session.preparationId, "interrupted", now())
        .catch(() => []);
      throw cancelledError();
    }
    if (row.status === "pending")
      throw new AppError(
        "PROJECT_COMMAND_DECISION_UNAVAILABLE",
        "The command authorization decision could not be read. No command was started.",
        503,
        true,
      );
    if (row.status === "rejected") return resultForTool(row);
    if (row.status === "cancelled" || row.status === "interrupted")
      return resultForTool(row);
    if (row.status !== "approved") return resultForTool(row);

    const claimed = await projectCommandModel.claim({
      id: row.id,
      preparationId: session.preparationId,
      runToken: session.runToken,
      at: now(),
    });
    if (!claimed) {
      const latest = await projectCommandModel.byId(row.id);
      if (latest?.status === "running")
        throw new AppError(
          "PROJECT_COMMAND_DUPLICATE",
          "This command is already running and was not started again.",
          409,
        );
      if (latest) return resultForTool(latest);
      throw recordFailed();
    }
    if (!session.active || session.signal?.aborted) {
      await projectCommandModel.finish({
        id: claimed.id,
        status: "cancelled",
        result: null,
        at: now(),
      });
      throw cancelledError();
    }

    const outcome = await session.runner.run({
      request: {
        command: claimed.command,
        cwd: claimed.cwd,
        install: claimed.install,
        network: claimed.network,
        timeoutMs: claimed.timeoutMs,
      },
      authorization: {
        attemptId: claimed.id,
        isCurrent: () =>
          session.active &&
          sessions.get(session.preparationId) === session &&
          !session.signal?.aborted,
      },
      signal: session.signal,
    });
    const result = boundedResult(outcome);
    const saved = await projectCommandModel.finish({
      id: claimed.id,
      status: persistedStatus(result.status),
      result,
      at: now(),
    });
    if (!saved)
      throw new AppError(
        "PROJECT_COMMAND_RECORD_FAILED",
        "The command result could not be saved. Project preparation stopped rather than reporting an unverified result.",
        503,
        true,
      );
    return resultForTool(saved);
  }

  async function endSession(session: CommandSession) {
    if (!session.active) return;
    session.active = false;
    if (sessions.get(session.preparationId) === session)
      sessions.delete(session.preparationId);
    const interrupted = await projectCommandModel
      .interruptPreparation(session.preparationId, "interrupted", now())
      .catch(() => []);
    wakeRows(interrupted);
    for (const id of session.commandIds) wake(id);
  }

  return {
    begin(input: {
      profileId: string;
      challengeId: string;
      preparationId: string;
      attempt: number;
      specificationHash: string;
      runToken: string;
      layout: ProjectLayout;
      signal?: AbortSignal;
    }): ProjectCommandRun {
      const session: CommandSession = {
        ...input,
        runner: createProjectCommandRunner({
          projectRoot: input.layout.projectRoot,
          metadataRoot: input.layout.metadataRoot,
        }),
        active: true,
        commandIds: new Set(),
      };
      sessions.set(input.preparationId, session);
      return {
        execute: (request) => execute(session, request),
        results: async () =>
          (await projectCommandModel.executed(input.preparationId)).map(
            projectCommandFromRow,
          ),
        end: () => endSession(session),
      };
    },

    async state(preparationId: string) {
      const [rows, authorization] = await Promise.all([
        projectCommandModel.list(preparationId, maxProjectCommandRecords),
        projectCommandModel.authorization(preparationId),
      ]);
      return {
        commands: rows.map(projectCommandFromRow),
        commandAuthorization: authorization
          ? projectCommandAuthorizationFromRow(authorization)
          : null,
      };
    },

    wake,

    async interruptPreparation(
      preparationId: string,
      status: "cancelled" | "interrupted",
    ) {
      const rows = await projectCommandModel.interruptPreparation(
        preparationId,
        status,
        now(),
      );
      wakeRows(rows);
    },

    async recover() {
      const rows = await projectCommandModel.markActiveInterrupted(now());
      wakeRows(rows);
      return rows.length;
    },
  };
}

export type ProjectCommandRuntime = ReturnType<
  typeof createProjectCommandRuntime
>;
