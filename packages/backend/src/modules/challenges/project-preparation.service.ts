import { dirname } from "node:path";
import type {
  ModelSelection,
  ProjectCommand,
  ProjectCommandAuthorization,
  ProjectFrozenSpecification,
  ProjectPreparation,
  ProjectPreparationActivity,
  ProjectPreparationError,
  ProjectPreparationMode,
  ProjectFileContent,
  ProjectFilesView,
  ProjectPreparationRecovery,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import type { MessageModel } from "../messages/message.model";
import type {
  ModelGateway,
  ProjectScaffoldContinuation,
  ProjectScaffoldPreviousAttempt,
} from "../ai/model-gateway";
import type { ProjectToolActivity } from "../ai/agent/tools/project";
import type { ProfileService } from "../profiles/profile.service";
import type { ChallengeModel, ChallengeRow } from "./challenge.model";
import { requireChallenge } from "./challenge.utils";
import {
  createProjectWorkspace,
  maxProjectAttempts,
  projectAttemptNumber,
  projectLayout,
  type ProjectLayout,
} from "./project-workspace";
import {
  projectPreparationModel,
  type ProjectPreparationRow,
} from "./project-preparation.model";
import {
  frozenProjectSpecification,
  frozenSpecificationPath,
  writeFrozenSpecification,
} from "./project-preparation.spec";
import { validateProjectScaffoldReport } from "./project-preparation.validation";
import {
  createProjectCommandRuntime,
  projectSpecificationHash,
} from "./project-command.runtime";
import { projectCommandModel } from "./project-command.model";
import {
  emptyProjectRecovery,
  inspectProjectResume,
  recoveryForInspection,
  type ProjectResumeInspection,
} from "./project-preparation.recovery";
import type { ChallengeWorkspaceService } from "./workspace";
import { harnessService } from "../harness/harness.service";
import { listProjectFiles, readProjectFile } from "./project-files";

const maxActivityEntries = 200;
const settlingTimeoutMs = 5_000;

export type StartProjectPreparationInput = {
  selection?: ModelSelection;
  /** Automatic kickoff passes the original generation request. */
  request?: string;
  /** Explicit recovery request. Existing `/start` keeps its original meaning. */
  mode?: ProjectPreparationMode;
};

type RunController = {
  preparationId: string;
  controller: AbortController;
  promise: Promise<void>;
};

function nowIso(at: Date) {
  return at.toISOString();
}

function boundedActivity(
  activity: ProjectPreparationActivity[],
): ProjectPreparationActivity[] {
  return activity.slice(-maxActivityEntries);
}

function safeDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 20_000) return { truncated: true };
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function projectError(error: unknown): ProjectPreparationError {
  if (error instanceof AppError) {
    const details = safeDetails(error.details);
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(details ? { details } : {}),
    };
  }
  return {
    code: "PROJECT_PREPARATION_FAILED",
    message:
      "Project preparation failed. The challenge and every partial project file are preserved.",
    retryable: true,
  };
}

function cancelledError(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof AppError &&
      (error.code === "REQUEST_CANCELLED" ||
        error.code === "PROJECT_OPERATION_CANCELLED"))
  );
}

function toolActivity(
  activity: ProjectToolActivity,
  at: Date,
): ProjectPreparationActivity {
  const base = { at: nowIso(at) };
  switch (activity.type) {
    case "listed":
      return {
        ...base,
        type: "listed",
        path: activity.path,
        entries: activity.entries,
        truncated: activity.truncated,
      };
    case "read":
      return {
        ...base,
        type: "read",
        path: activity.path,
        bytes: activity.bytes,
      };
    case "searched":
      return {
        ...base,
        type: "searched",
        query: activity.query.slice(0, 300),
        matches: activity.matches,
        truncated: activity.truncated,
      };
    case "created_directory":
      return { ...base, type: "created_directory", path: activity.path };
    case "created_file":
      return {
        ...base,
        type: "created_file",
        path: activity.path,
        bytes: activity.bytes,
      };
    case "edited_file":
      return {
        ...base,
        type: "edited_file",
        path: activity.path,
        bytes: activity.bytes,
        replacements: activity.replacements,
      };
  }
}

function previousPointer(row: ProjectPreparationRow | undefined) {
  if (!row) return null;
  return {
    attempt: row.attempt,
    status: row.status,
    projectDirectory: row.projectDirectory,
    summary: row.report?.summary ?? null,
  };
}

function previousAttemptInput(
  row: ProjectPreparationRow | undefined,
): ProjectScaffoldPreviousAttempt | null {
  if (!row) return null;
  return {
    attempt: row.attempt,
    status: row.status,
    projectDirectory: row.projectDirectory,
    projectPath: row.projectPath,
    summary: row.report?.summary ?? null,
    todos: (row.report?.todos ?? []).slice(0, 50),
    problems: (row.report?.problems ?? []).slice(0, 20),
    error: row.error
      ? { code: row.error.code, message: row.error.message }
      : null,
  };
}

/**
 * Rebuild the layout for an already-recorded attempt. The attempt number is a
 * logical run ordinal and may differ from the folder ordinal after a resume, so
 * the folder name stored on the row is authoritative.
 */
function recordedProjectLayout(row: ProjectPreparationRow): ProjectLayout {
  const folderAttempt = projectAttemptNumber(row.projectDirectory);
  if (!folderAttempt)
    throw new AppError(
      "PROJECT_PREPARATION_INVALID",
      "The saved project folder name is invalid. Start a fresh attempt.",
      409,
    );
  const layout = projectLayout(dirname(row.projectPath), folderAttempt);
  if (
    layout.projectRoot !== row.projectPath ||
    layout.projectDirectory !== row.projectDirectory
  )
    throw new AppError(
      "PROJECT_PREPARATION_INVALID",
      "The saved project preparation path is invalid. Start a fresh attempt.",
      409,
    );
  return layout;
}

function preparationRecordError(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  if (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    (error instanceof Error &&
      error.message.includes("UNIQUE constraint failed"))
  )
    return new AppError(
      "PROJECT_PREPARATION_CONFLICT",
      "Another preparation attempt was recorded at the same time. Every existing and newly created project folder is preserved; try again from the refreshed preparation state.",
      409,
      true,
    );
  return new AppError(
    "PROJECT_PREPARATION_UNAVAILABLE",
    "Project preparation could not be recorded. Every existing and newly created project folder is preserved.",
    503,
    true,
  );
}

async function createPreparationRecord(
  input: Parameters<typeof projectPreparationModel.create>[0],
) {
  try {
    const row = await projectPreparationModel.create(input);
    if (row) return row;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw preparationRecordError(error);
  }
  throw new AppError(
    "PROJECT_PREPARATION_UNAVAILABLE",
    "Project preparation could not be recorded.",
    500,
    true,
  );
}

function publicPreparation(
  challengeId: string,
  row: ProjectPreparationRow | undefined,
  previous: ProjectPreparationRow | undefined,
  commands: ProjectCommand[] = [],
  commandAuthorization: ProjectCommandAuthorization | null = null,
  recovery: ProjectPreparationRecovery = emptyProjectRecovery(),
): ProjectPreparation {
  if (!row)
    return {
      id: null,
      challengeId,
      attempt: null,
      projectDirectory: null,
      projectPath: null,
      mode: null,
      status: "not_started",
      specification: null,
      report: null,
      activity: [],
      commands: [],
      commandAuthorization: null,
      error: null,
      requestedModel: null,
      startedAt: null,
      completedAt: null,
      updatedAt: null,
      recovery,
      previousAttempt: null,
    };
  return {
    id: row.id,
    challengeId: row.challengeId,
    attempt: row.attempt,
    projectDirectory: row.projectDirectory,
    projectPath: row.projectPath,
    mode: row.mode,
    status: row.status,
    specification: row.specification,
    report: row.report ?? null,
    activity: boundedActivity(row.activity),
    commands,
    commandAuthorization,
    error: row.error ?? null,
    requestedModel: row.requestedModel,
    startedAt: row.startedAt ? nowIso(row.startedAt) : null,
    completedAt: row.completedAt ? nowIso(row.completedAt) : null,
    updatedAt: nowIso(row.updatedAt),
    recovery,
    previousAttempt: previousPointer(previous),
  };
}

export function createProjectPreparationService(dependencies: {
  challenges: ChallengeModel;
  messages: MessageModel;
  profiles: ProfileService;
  workspaces: ChallengeWorkspaceService;
  llm: ModelGateway;
  now?: () => Date;
}) {
  const { challenges, messages, profiles, workspaces, llm } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const commands = createProjectCommandRuntime({ now });
  const transitions = new Map<string, Promise<unknown>>();
  const activeRuns = new Map<string, RunController>();

  function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = transitions.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tracked = run.catch(() => {});
    transitions.set(key, tracked);
    void tracked.finally(() => {
      if (transitions.get(key) === tracked) transitions.delete(key);
    });
    return run;
  }

  async function settling<T>(
    promise: Promise<T>,
    timeoutMs = settlingTimeoutMs,
  ): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref?.();
    });
    const settled = promise.then(
      () => true as const,
      () => true as const,
    );
    const result = await Promise.race([settled, timeout]);
    if (timer) clearTimeout(timer);
    return result;
  }

  async function drainActiveRun(challengeId: string) {
    const active = activeRuns.get(challengeId);
    if (!active) return;
    // Fence the agent and command session synchronously before the first
    // awaited database update so no command can reach its pre-spawn check.
    active.controller.abort();
    commands.deactivate(active.preparationId);
    await commands
      .interruptPreparation(active.preparationId, "interrupted")
      .catch(() => {});
    if (await settling(active.promise)) return;
    throw new AppError(
      "PROJECT_PREPARATION_BUSY",
      "The previous preparation run is still stopping. No new run was started; try again once its files and commands are settled.",
      409,
      true,
    );
  }

  async function recoveryState(
    row: ProjectPreparationRow | undefined,
  ): Promise<ProjectPreparationRecovery> {
    if (!row) return emptyProjectRecovery();
    const recoverable =
      row.status === "failed" ||
      row.status === "cancelled" ||
      row.status === "interrupted";
    if (!recoverable) return emptyProjectRecovery();
    const settling = activeRuns.has(row.challengeId);
    const attemptsExhausted = row.attempt >= maxProjectAttempts;
    const inspection = await inspectProjectResume({
      projectPath: row.projectPath,
      projectDirectory: row.projectDirectory,
    });
    return recoveryForInspection({
      status: inspection.status,
      message: inspection.message,
      path: inspection.path,
      missingFiles: inspection.missingFiles,
      missingFileCount: inspection.missingFileCount,
      settling,
      recoverable: true,
      attemptsExhausted,
    });
  }

  async function preparationView(
    challengeId: string,
    row: ProjectPreparationRow | undefined,
    previous: ProjectPreparationRow | undefined,
  ) {
    const state = row
      ? await commands.state(row.id)
      : { commands: [], commandAuthorization: null };
    return publicPreparation(
      challengeId,
      row,
      previous,
      state.commands,
      state.commandAuthorization,
      await recoveryState(row),
    );
  }

  async function originalRequest(challenge: ChallengeRow) {
    const snapshot = challenge.contextSnapshot?.currentRequest;
    if (typeof snapshot === "string" && snapshot.trim())
      return snapshot.trim().slice(0, 4_000);
    const rows = await messages.findRowsByChallenge(challenge.id);
    const request = rows.find(
      (row) => row.role === "user" && row.mode === "generate",
    );
    if (request?.content.trim()) return request.content.trim().slice(0, 4_000);
    return challenge.problemStatement.trim().slice(0, 4_000);
  }

  async function owned(profileId: string, challengeId: string) {
    await profiles.assertExists(profileId);
    return requireChallenge(await challenges.findOwned(challengeId, profileId));
  }

  async function projectFilesLayout(profileId: string, challengeId: string) {
    await owned(profileId, challengeId);
    const row = await projectPreparationModel.latest(challengeId);
    if (!row)
      throw new AppError(
        "PROJECT_NOT_FOUND",
        "This challenge does not have a prepared project folder yet.",
        404,
      );
    return recordedProjectLayout(row);
  }

  async function detail(profileId: string, challengeId: string) {
    await owned(profileId, challengeId);
    const row = await projectPreparationModel.latest(challengeId);
    const previous = row
      ? await projectPreparationModel.previous(challengeId, row.attempt)
      : undefined;
    return preparationView(challengeId, row, previous);
  }

  function addActivity(
    activity: ProjectPreparationActivity[],
    entry: ProjectPreparationActivity,
  ) {
    activity.push(entry);
    if (activity.length > maxActivityEntries)
      activity.splice(0, activity.length - maxActivityEntries);
  }

  /** Setup actions are chat messages in the same conversation. */
  function preparationTurnText(row: ProjectPreparationRow) {
    if (row.mode === "resume") return "Continue setting up the codebase.";
    if (row.mode === "retry") return "Retry the codebase setup.";
    if (row.mode === "fresh") return "Set up the codebase in a new folder.";
    return `Set up the codebase for ${row.specification.title}.`;
  }

  async function runPreparation(input: {
    row: ProjectPreparationRow;
    runToken: string;
    layout: ProjectLayout;
    specification: ProjectFrozenSpecification;
    previous: ProjectPreparationRow | undefined;
    selection?: ModelSelection;
    continuation?: ProjectScaffoldContinuation | null;
    activity: ProjectPreparationActivity[];
    controller: AbortController;
  }) {
    const { row, runToken, layout, specification, previous, controller } =
      input;
    // Only a report that passed server validation may be persisted. The raw
    // gateway payload is never stored as a trusted report.
    let validatedReport: ProjectScaffoldReport | undefined;

    let commandSession: ReturnType<typeof commands.begin> | undefined;
    try {
      commandSession = commands.begin({
        profileId: row.profileId,
        challengeId: row.challengeId,
        preparationId: row.id,
        attempt: row.attempt,
        specificationHash: projectSpecificationHash(specification),
        runToken,
        layout,
        signal: controller.signal,
      });
      if (!llm.scaffoldProject)
        throw new AppError(
          "MODEL_UNAVAILABLE",
          "This model does not support project scaffolding.",
          503,
        );
      // Preparation attempts are durable rows, but their conversation is one
      // challenge-owned transcript. Reuse the latest existing thread so every
      // resume appends instead of creating another indistinguishable run.
      const existing = await harnessService.findThread({
        profileId: row.profileId,
        challengeId: row.challengeId,
        kind: "project_scaffold",
      });
      const thread =
        existing ??
        (await harnessService.createThread({
          profileId: row.profileId,
          kind: "project_scaffold",
          title: specification.title,
          challengeId: row.challengeId,
          transport: "api",
          model: input.selection?.model ?? specification.model.label ?? "auto",
        }));
      const turn = await harnessService.appendTurn(thread.id, {
        inputText: preparationTurnText(row),
        model: input.selection?.model ?? specification.model.label ?? "auto",
      });
      const reported = await llm.scaffoldProject({
        profileId: row.profileId,
        challengeId: row.challengeId,
        selection: input.selection,
        signal: controller.signal,
        specification,
        layout,
        previousAttempt: previousAttemptInput(previous),
        continuation: input.continuation ?? null,
        harness: {
          threadId: thread.id,
          turnId: turn.id,
          inputText: turn.inputText,
        },
        permissionMode: harnessService.currentRuntimeMode(),
        requestPermission: async (request) => {
          const decision = await harnessService.request({
            threadId: thread.id,
            turnId: turn.id,
            type: "approval_request",
            kind: request.action,
            prompt: request.prompt,
            signal: request.signal ?? controller.signal,
          });
          if (decision.decision !== "allow")
            throw new AppError(
              "PERMISSION_DENIED",
              "The requested project action was denied.",
              403,
            );
        },
        runProjectCommand: commandSession.execute,
        commandResults: commandSession.results,
      });
      if (controller.signal.aborted)
        throw new AppError(
          "REQUEST_CANCELLED",
          "Project preparation was cancelled.",
          499,
        );
      const validated = await validateProjectScaffoldReport(reported, {
        layout,
        specification,
        allowExecutionResults: true,
        commands: await commandSession.results(),
      });
      validatedReport = validated;
      // Older reports used problems for blockers. New reports distinguish
      // scaffold defects from expected exercise gaps and informational notes.
      const blockers = validated.blockingProblems ?? validated.problems;
      if (blockers.length) {
        await projectPreparationModel.finish({
          id: row.id,
          runToken,
          status: "failed",
          report: validated,
          error: {
            code: "PROJECT_SCAFFOLD_INCOMPLETE",
            message:
              "Project preparation finished with unresolved problems. Partial files are preserved.",
            retryable: true,
            details: { problems: blockers.slice(0, 20) },
          },
          activity: row.activity,
          at: now(),
        });
        return;
      }
      await projectPreparationModel.finish({
        id: row.id,
        runToken,
        status: "ready",
        report: validated,
        error: null,
        activity: row.activity,
        at: now(),
      });
    } catch (error) {
      const cancelled = cancelledError(error, controller.signal);
      await projectPreparationModel.finish({
        id: row.id,
        runToken,
        status: cancelled ? "cancelled" : "failed",
        report: cancelled ? null : (validatedReport ?? null),
        error: cancelled ? null : projectError(error),
        activity: row.activity,
        at: now(),
      });
    } finally {
      await commandSession?.end().catch(() => {});
    }
  }

  function schedule(input: {
    row: ProjectPreparationRow;
    runToken: string;
    layout: ProjectLayout;
    specification: ProjectFrozenSpecification;
    previous: ProjectPreparationRow | undefined;
    selection?: ModelSelection;
    continuation?: ProjectScaffoldContinuation | null;
    activity: ProjectPreparationActivity[];
  }) {
    const controller = new AbortController();
    const active: RunController = {
      preparationId: input.row.id,
      controller,
      promise: Promise.resolve(),
    };
    const promise = runPreparation({ ...input, controller })
      .catch(() => {})
      .finally(() => {
        if (activeRuns.get(input.row.challengeId) === active)
          activeRuns.delete(input.row.challengeId);
      });
    active.promise = promise;
    activeRuns.set(input.row.challengeId, active);
    return promise;
  }

  function resumeFailure(inspection: ProjectResumeInspection) {
    const details = {
      freshAvailable: true,
      ...(inspection.path ? { path: inspection.path } : {}),
    };
    switch (inspection.status) {
      case "file_modified":
        return new AppError(
          "PROJECT_FILE_MODIFIED",
          `${inspection.message} Inspect the changed file, then start a fresh project folder if you want to keep it.`,
          409,
          false,
          details,
        );
      case "journal_missing":
        return new AppError(
          "PROJECT_PREPARATION_JOURNAL_MISSING",
          `${inspection.message} Start a fresh project folder to continue; the existing files are preserved.`,
          409,
          false,
          details,
        );
      case "journal_invalid":
        return new AppError(
          "PROJECT_PREPARATION_JOURNAL_INVALID",
          `${inspection.message} Start a fresh project folder to continue; the existing files are preserved.`,
          409,
          false,
          details,
        );
      case "journal_unavailable":
        return new AppError(
          "PROJECT_PREPARATION_JOURNAL_UNAVAILABLE",
          `${inspection.message} Resume did not start. You can retry resume or start a fresh project folder.`,
          503,
          true,
          details,
        );
      case "project_missing":
        return new AppError(
          "PROJECT_PREPARATION_PROJECT_MISSING",
          `${inspection.message} Start a fresh project folder to continue; earlier attempts are not deleted.`,
          409,
          false,
          details,
        );
      default:
        return new AppError(
          "PROJECT_PREPARATION_RESUME_UNAVAILABLE",
          `${inspection.message ?? "This project cannot be resumed."} Start a fresh project folder to continue.`,
          409,
          false,
          details,
        );
    }
  }

  function notRecoverable(status: ProjectPreparationRow["status"]) {
    return new AppError(
      "PROJECT_PREPARATION_NOT_RECOVERABLE",
      status === "ready"
        ? "Project files are already prepared. Start a fresh project folder only after a failed, cancelled, or interrupted attempt."
        : status === "running"
          ? "Project preparation is still running. Wait for it to finish or cancel it first."
          : "No previous project attempt can be recovered for this challenge.",
      409,
    );
  }

  async function begin(
    profileId: string,
    challengeId: string,
    options: StartProjectPreparationInput,
  ): Promise<ProjectPreparation> {
    const challenge = await owned(profileId, challengeId);
    if (!llm.scaffoldProject)
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "This model does not support project scaffolding.",
        503,
      );

    const mode = options.mode ?? "start";
    const latest = await projectPreparationModel.latest(challengeId);
    if (latest?.status === "running")
      return preparationView(
        challengeId,
        latest,
        await projectPreparationModel.previous(challengeId, latest.attempt),
      );
    if (mode === "start" && latest?.status === "ready")
      return preparationView(
        challengeId,
        latest,
        await projectPreparationModel.previous(challengeId, latest.attempt),
      );
    if (mode !== "start") {
      if (
        !latest ||
        (latest.status !== "failed" &&
          latest.status !== "cancelled" &&
          latest.status !== "interrupted")
      )
        throw notRecoverable(latest?.status ?? "not_started");
      if (latest.attempt >= maxProjectAttempts)
        throw new AppError(
          "PROJECT_ATTEMPTS_EXHAUSTED",
          "This challenge reached the maximum number of preparation attempts.",
          409,
        );
    }

    // A terminal database row can still belong to an agent or command process
    // that is unwinding. Never create a competing writer until it has stopped.
    await drainActiveRun(challengeId);
    const current = await projectPreparationModel.latest(challengeId);
    const base = current ?? latest;
    if (base?.status === "running") {
      return preparationView(
        challengeId,
        base,
        await projectPreparationModel.previous(challengeId, base.attempt),
      );
    }
    if (
      mode !== "start" &&
      base &&
      base.status !== "failed" &&
      base.status !== "cancelled" &&
      base.status !== "interrupted"
    )
      throw notRecoverable(base.status);
    if (base && base.status !== "not_started") {
      // Supersession fences any in-memory command session synchronously before
      // the awaited database interrupt.
      commands.deactivate(base.id);
      await commands.interruptPreparation(base.id, "interrupted");
    }

    let layout: ProjectLayout;
    let specification: ProjectFrozenSpecification;
    let previous: ProjectPreparationRow | undefined;
    let row: ProjectPreparationRow | undefined;
    let selection = options.selection;
    let continuation: ProjectScaffoldContinuation | null = null;
    let activeMode: ProjectPreparationMode = mode;

    if (mode === "resume" && base) {
      const inspection = await inspectProjectResume({
        projectPath: base.projectPath,
        projectDirectory: base.projectDirectory,
      });
      if (inspection.status !== "available" || !inspection.layout)
        throw resumeFailure(inspection);
      layout = inspection.layout;
      if (challenge.workspacePath !== layout.workspaceRoot) {
        await challenges.setWorkspacePath(challenge.id, layout.workspaceRoot);
        challenge.workspacePath = layout.workspaceRoot;
      }
      previous = base;
      specification = base.specification;
      selection = specification.model.selection ?? undefined;
      const challengeMissing = inspection.missingFiles.includes(
        frozenSpecificationPath,
      );
      continuation = {
        resumedFromAttempt: base.attempt,
        missingFiles: inspection.missingFiles.filter(
          (path) => path !== frozenSpecificationPath,
        ),
        missingFileCount: Math.max(
          0,
          inspection.missingFileCount - (challengeMissing ? 1 : 0),
        ),
      };
      // The attempt number is the logical run ordinal, not the folder ordinal.
      // It must stay unique even when resume reuses the existing folder.
      row = await createPreparationRecord({
        id: crypto.randomUUID(),
        profileId,
        challengeId,
        attempt: base.attempt + 1,
        projectDirectory: layout.projectDirectory,
        projectPath: layout.projectRoot,
        specification,
        mode: "resume",
        requestedModel:
          base.requestedModel ?? specification.model.selection?.model ?? null,
        at: now(),
      });
    } else if (mode === "start" && base?.status === "not_started") {
      // A process can stop after a pending attempt row is recorded but before
      // it starts running. Reconstruct the recorded attempt from its own folder
      // and frozen specification instead of allocating another folder.
      row = base;
      activeMode = base.mode;
      specification = base.specification;
      selection = specification.model.selection ?? undefined;
      previous =
        activeMode === "fresh"
          ? undefined
          : await projectPreparationModel.previous(challengeId, base.attempt);
      try {
        layout = recordedProjectLayout(base);
        if (activeMode === "resume") {
          const inspection = await inspectProjectResume({
            projectPath: base.projectPath,
            projectDirectory: base.projectDirectory,
          });
          if (inspection.status !== "available" || !inspection.layout)
            throw resumeFailure(inspection);
          layout = inspection.layout;
          if (challenge.workspacePath !== layout.workspaceRoot) {
            await challenges.setWorkspacePath(
              challenge.id,
              layout.workspaceRoot,
            );
            challenge.workspacePath = layout.workspaceRoot;
          }
          const challengeMissing = inspection.missingFiles.includes(
            frozenSpecificationPath,
          );
          continuation = {
            resumedFromAttempt:
              previous?.attempt ?? Math.max(1, base.attempt - 1),
            missingFiles: inspection.missingFiles.filter(
              (path) => path !== frozenSpecificationPath,
            ),
            missingFileCount: Math.max(
              0,
              inspection.missingFileCount - (challengeMissing ? 1 : 0),
            ),
          };
        }
      } catch (error) {
        // A pending attempt that cannot be reconstructed must become
        // recoverable instead of trapping the challenge in not_started.
        const failure =
          error instanceof AppError
            ? error
            : new AppError(
                "PROJECT_PREPARATION_UNAVAILABLE",
                "The pending project preparation could not be reconstructed.",
                503,
                true,
              );
        const failed = await projectPreparationModel.failPending(
          base.id,
          projectError(failure),
          base.activity,
          now(),
        );
        if (failed) return preparationView(challengeId, failed, previous);
        throw failure;
      }
    } else {
      previous = base;
      const attempt = (base?.attempt ?? 0) + 1;
      if (attempt > maxProjectAttempts)
        throw new AppError(
          "PROJECT_ATTEMPTS_EXHAUSTED",
          "This challenge reached the maximum number of preparation attempts.",
          409,
        );
      const workspace = await workspaces.ensure(challenge);
      if (challenge.workspacePath !== workspace.path) {
        await challenges.setWorkspacePath(challenge.id, workspace.path);
        challenge.workspacePath = workspace.path;
      }
      const created = await createProjectWorkspace({
        root: workspace.path,
        now,
      });
      layout = created.layout;
      if (mode === "retry" || mode === "fresh") {
        // Retry and fresh preserve the saved frozen specification exactly: no
        // challenge regeneration, no new request or preference snapshot.
        specification = base!.specification;
        selection = specification.model.selection ?? undefined;
      } else {
        const preferences = await profiles.getPreferences(profileId);
        specification = frozenProjectSpecification({
          challenge,
          request:
            options.request?.trim() || (await originalRequest(challenge)),
          preferences,
          selection,
          at: now(),
        });
      }
      // The new folder ordinal is independent of the logical attempt number,
      // which must keep increasing after a resume reused an older folder.
      row = await createPreparationRecord({
        id: crypto.randomUUID(),
        profileId,
        challengeId,
        attempt,
        projectDirectory: layout.projectDirectory,
        projectPath: layout.projectRoot,
        specification,
        mode,
        requestedModel:
          mode === "retry" || mode === "fresh"
            ? (base?.requestedModel ??
              specification.model.selection?.model ??
              null)
            : (selection?.model ??
              specification.model.selection?.model ??
              null),
        at: now(),
      });
    }

    const activity = [...row.activity];
    try {
      await writeFrozenSpecification(layout, specification, now);
    } catch (error) {
      addActivity(activity, {
        type: "failed",
        at: nowIso(now()),
        message:
          "The frozen specification could not be saved. No scaffolding started.",
      });
      const failed = await projectPreparationModel.failPending(
        row.id,
        projectError(error),
        boundedActivity(activity),
        now(),
      );
      if (failed) return preparationView(challengeId, failed, previous);
      throw error;
    }
    if (!activity.some((entry) => entry.type === "specification_saved"))
      addActivity(activity, {
        type: "specification_saved",
        at: nowIso(now()),
        path: frozenSpecificationPath,
      });

    const runToken = crypto.randomUUID();
    addActivity(activity, {
      type: "started",
      at: nowIso(now()),
      message:
        activeMode === "resume"
          ? `Resumed attempt ${previous?.attempt ?? Math.max(1, row.attempt - 1)} in ${layout.projectDirectory}.`
          : activeMode === "retry"
            ? `Retried attempt ${previous?.attempt ?? Math.max(1, row.attempt - 1)} in ${layout.projectDirectory} with the saved frozen specification.`
            : activeMode === "fresh"
              ? `Started a fresh project folder from the saved frozen specification.`
              : "Scaffolding started.",
    });
    // Keep any legacy activity exactly as stored. New progress lives in the
    // project_scaffold harness transcript.
    const running = await projectPreparationModel.markRunning(
      row.id,
      runToken,
      row.activity,
      now(),
    );
    if (!running) {
      const active =
        (await projectPreparationModel.active(challengeId)) ??
        (await projectPreparationModel.latest(challengeId));
      if (active)
        return preparationView(
          challengeId,
          active,
          await projectPreparationModel.previous(challengeId, active.attempt),
        );
      throw new AppError(
        "PROJECT_PREPARATION_UNAVAILABLE",
        "Project preparation could not start.",
        500,
        true,
      );
    }

    schedule({
      row: running,
      runToken,
      layout,
      specification,
      previous: activeMode === "fresh" ? undefined : previous,
      selection,
      continuation,
      activity,
    });
    return preparationView(challengeId, running, previous);
  }

  async function currentCommandPreparation(
    profileId: string,
    challengeId: string,
  ) {
    await owned(profileId, challengeId);
    const latest = await projectPreparationModel.latest(challengeId);
    if (!latest || latest.status !== "running")
      throw new AppError(
        "PROJECT_COMMAND_STALE",
        "There is no running preparation attempt for this command approval.",
        409,
      );
    return latest;
  }

  function commandIsCurrent(
    preparation: ProjectPreparationRow,
    row: { preparationId: string; runToken: string; specificationHash: string },
  ) {
    return (
      row.preparationId === preparation.id &&
      row.runToken === preparation.runToken &&
      row.specificationHash ===
        projectSpecificationHash(preparation.specification)
    );
  }

  async function decideCommand(
    profileId: string,
    challengeId: string,
    commandId: string,
    decision: "approved" | "rejected",
  ) {
    const preparation = await currentCommandPreparation(profileId, challengeId);
    const row = await projectCommandModel.byId(commandId);
    if (!row || row.profileId !== profileId || row.challengeId !== challengeId)
      throw new AppError(
        "PROJECT_COMMAND_NOT_FOUND",
        "That command approval does not exist for this challenge.",
        404,
      );
    if (!commandIsCurrent(preparation, row)) {
      await projectCommandModel.interruptOne(row.id, "interrupted", now());
      commands.wake(row.id);
      throw new AppError(
        "PROJECT_COMMAND_STALE",
        "This command approval belongs to a superseded preparation attempt and was not used.",
        409,
      );
    }
    if (
      row.status === decision ||
      (decision === "approved" && row.status === "running")
    )
      return preparationView(
        challengeId,
        preparation,
        await projectPreparationModel.previous(
          challengeId,
          preparation.attempt,
        ),
      );
    if (row.status !== "pending")
      throw new AppError(
        "PROJECT_COMMAND_DECIDED",
        "This command already has a final authorization decision.",
        409,
      );
    const updated = await projectCommandModel.decide({
      id: row.id,
      preparationId: preparation.id,
      runToken: preparation.runToken!,
      status: decision,
      authorization: decision === "approved" ? "individual" : null,
      at: now(),
    });
    if (!updated) {
      const latest = await projectCommandModel.byId(row.id);
      if (
        latest &&
        (latest.status === decision ||
          (decision === "approved" && latest.status === "running"))
      )
        return preparationView(
          challengeId,
          preparation,
          await projectPreparationModel.previous(
            challengeId,
            preparation.attempt,
          ),
        );
      if (!latest || latest.status !== "pending")
        throw new AppError(
          "PROJECT_COMMAND_DECIDED",
          "This command was decided by another request.",
          409,
        );
      throw new AppError(
        "PROJECT_COMMAND_UNAVAILABLE",
        "The command decision could not be saved.",
        503,
        true,
      );
    }
    commands.wake(row.id);
    return preparationView(
      challengeId,
      preparation,
      await projectPreparationModel.previous(challengeId, preparation.attempt),
    );
  }

  async function saveAttemptAuthorization(
    profileId: string,
    challengeId: string,
    authorization: { install: boolean; network: boolean },
  ) {
    const preparation = await currentCommandPreparation(profileId, challengeId);
    const at = now();
    const saved = await projectCommandModel.upsertAuthorization({
      id: crypto.randomUUID(),
      profileId,
      challengeId,
      preparationId: preparation.id,
      attempt: preparation.attempt,
      specificationHash: projectSpecificationHash(preparation.specification),
      runToken: preparation.runToken!,
      install: authorization.install,
      network: authorization.network,
      at,
    });
    if (!saved)
      throw new AppError(
        "PROJECT_COMMAND_UNAVAILABLE",
        "The attempt authorization could not be saved.",
        503,
        true,
      );
    const approved = await projectCommandModel.approvePendingForAttempt({
      preparationId: preparation.id,
      runToken: preparation.runToken!,
      install: authorization.install,
      network: authorization.network,
      at,
    });
    for (const row of approved) commands.wake(row.id);
    return preparationView(
      challengeId,
      preparation,
      await projectPreparationModel.previous(challengeId, preparation.attempt),
    );
  }

  function transitionKey(profileId: string, challengeId: string) {
    return `${profileId}:${challengeId}`;
  }

  function recoverAttempt(
    mode: Exclude<ProjectPreparationMode, "start">,
    profileId: string,
    challengeId: string,
  ) {
    return serialize(transitionKey(profileId, challengeId), () =>
      begin(profileId, challengeId, { mode }),
    );
  }

  return {
    available() {
      return Boolean(llm.scaffoldProject);
    },

    get: detail,

    async files(
      profileId: string,
      challengeId: string,
    ): Promise<ProjectFilesView> {
      const layout = await projectFilesLayout(profileId, challengeId);
      const result = await listProjectFiles(layout);
      return {
        projectDirectory: layout.projectDirectory,
        projectPath: layout.projectRoot,
        ...result,
      };
    },

    async file(
      profileId: string,
      challengeId: string,
      path: string,
    ): Promise<ProjectFileContent> {
      const layout = await projectFilesLayout(profileId, challengeId);
      return readProjectFile(layout, path);
    },

    start(
      profileId: string,
      challengeId: string,
      options: StartProjectPreparationInput = {},
    ) {
      return serialize(transitionKey(profileId, challengeId), () =>
        begin(profileId, challengeId, { ...options, mode: "start" }),
      );
    },

    retry(profileId: string, challengeId: string) {
      return recoverAttempt("retry", profileId, challengeId);
    },

    resume(profileId: string, challengeId: string) {
      return recoverAttempt("resume", profileId, challengeId);
    },

    fresh(profileId: string, challengeId: string) {
      return recoverAttempt("fresh", profileId, challengeId);
    },

    cancel(profileId: string, challengeId: string) {
      return serialize(transitionKey(profileId, challengeId), async () => {
        await owned(profileId, challengeId);
        // Fence the agent and command session synchronously before the first
        // awaited update. Otherwise a command could pass its pre-spawn check
        // while cancellation is still writing the database.
        const active = activeRuns.get(challengeId);
        if (active) {
          active.controller.abort();
          commands.deactivate(active.preparationId);
        }
        const current = await projectPreparationModel.latest(challengeId);
        if (!current) return preparationView(challengeId, undefined, undefined);
        if (current.status !== "not_started" && current.status !== "running")
          return preparationView(
            challengeId,
            current,
            await projectPreparationModel.previous(
              challengeId,
              current.attempt,
            ),
          );
        const at = now();
        const cancelled = await projectPreparationModel.cancel(
          challengeId,
          {
            type: "cancelled",
            at: nowIso(at),
            message: "Preparation was cancelled. Partial files are preserved.",
          },
          at,
        );
        const target = cancelled ?? current;
        await commands.interruptPreparation(target.id, "cancelled");
        if (active && active.preparationId === target.id) {
          // Wait for the agent and its process group to unwind before the
          // response offers another attempt. A stuck run remains fenced by its
          // cancelled row and the next transition still waits for it.
          await settling(active.promise);
        }
        const previous = cancelled
          ? await projectPreparationModel.previous(
              challengeId,
              cancelled.attempt,
            )
          : undefined;
        return preparationView(challengeId, target, previous);
      });
    },

    approveCommand(profileId: string, challengeId: string, commandId: string) {
      return decideCommand(profileId, challengeId, commandId, "approved");
    },

    rejectCommand(profileId: string, challengeId: string, commandId: string) {
      return decideCommand(profileId, challengeId, commandId, "rejected");
    },

    authorizeAttemptCommands(
      profileId: string,
      challengeId: string,
      authorization: { install: boolean; network: boolean },
    ) {
      return saveAttemptAuthorization(profileId, challengeId, authorization);
    },

    async recover() {
      const preparations = await projectPreparationModel.markInterrupted(now());
      const commandsRecovered = await commands.recover();
      return { preparations, commands: commandsRecovered };
    },

    async stop() {
      const wait = (tasks: Promise<unknown>[]) =>
        Promise.race([
          Promise.allSettled(tasks),
          new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 2_000);
            timeout.unref();
          }),
        ]);
      const fence = () => {
        for (const entry of activeRuns.values()) entry.controller.abort();
        commands.deactivateAll();
      };
      const pendingTransitions = [...transitions.values()];
      fence();
      await projectPreparationModel.markInterrupted(now()).catch(() => {});
      await commands.recover().catch(() => {});
      if (pendingTransitions.length) await wait(pendingTransitions);
      // A start that was already in preflight may have scheduled while the
      // first pass ran. Fence and abort again before closing the database.
      fence();
      await projectPreparationModel.markInterrupted(now()).catch(() => {});
      await commands.recover().catch(() => {});
      fence();
      const running = [...activeRuns.values()].map((entry) => entry.promise);
      if (running.length) await wait(running);
    },
  };
}

export type ProjectPreparationService = ReturnType<
  typeof createProjectPreparationService
>;
