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
    active.controller.abort();
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
    const {
      row,
      runToken,
      layout,
      specification,
      previous,
      activity,
      controller,
    } = input;
    let scaffoldReport: ProjectScaffoldReport | undefined;

    const persistActivity = async (entry: ProjectPreparationActivity) => {
      addActivity(activity, entry);
      await projectPreparationModel
        .updateActivity(row.id, runToken, boundedActivity(activity), now())
        .catch(() => {});
    };

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
      scaffoldReport = await llm.scaffoldProject({
        profileId: row.profileId,
        challengeId: row.challengeId,
        selection: input.selection,
        signal: controller.signal,
        specification,
        layout,
        previousAttempt: previousAttemptInput(previous),
        continuation: input.continuation ?? null,
        onActivity: (entry) => persistActivity(toolActivity(entry, now())),
        runProjectCommand: commandSession.execute,
        commandResults: commandSession.results,
      });
      if (controller.signal.aborted)
        throw new AppError(
          "REQUEST_CANCELLED",
          "Project preparation was cancelled.",
          499,
        );
      const validated = await validateProjectScaffoldReport(scaffoldReport, {
        layout,
        specification,
        allowExecutionResults: true,
        commands: await commandSession.results(),
      });
      scaffoldReport = validated;
      if (validated.problems.length) {
        await persistActivity({
          type: "failed",
          at: nowIso(now()),
          message: "Preparation reported unresolved problems.",
        });
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
            details: { problems: validated.problems.slice(0, 20) },
          },
          activity: boundedActivity(activity),
          at: now(),
        });
        return;
      }
      await persistActivity({
        type: "completed",
        at: nowIso(now()),
        message: "Project files and frozen specification are ready.",
      });
      await projectPreparationModel.finish({
        id: row.id,
        runToken,
        status: "ready",
        report: validated,
        error: null,
        activity: boundedActivity(activity),
        at: now(),
      });
    } catch (error) {
      const cancelled = cancelledError(error, controller.signal);
      await persistActivity({
        type: cancelled ? "cancelled" : "failed",
        at: nowIso(now()),
        message: cancelled
          ? "Preparation was cancelled. Partial files are preserved."
          : "Preparation failed. Partial files are preserved.",
      });
      await projectPreparationModel.finish({
        id: row.id,
        runToken,
        status: cancelled ? "cancelled" : "failed",
        report: cancelled ? null : (scaffoldReport ?? null),
        error: cancelled ? null : projectError(error),
        activity: boundedActivity(activity),
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
    if (base && base.status !== "not_started")
      await commands.interruptPreparation(base.id, "interrupted");

    let layout: ProjectLayout;
    let specification: ProjectFrozenSpecification;
    let previous: ProjectPreparationRow | undefined;
    let row: ProjectPreparationRow | undefined;
    let selection = options.selection;
    let continuation: ProjectScaffoldContinuation | null = null;

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
      row = await projectPreparationModel.create({
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
      if (!row)
        throw new AppError(
          "PROJECT_PREPARATION_UNAVAILABLE",
          "The resumed project preparation could not be recorded.",
          500,
          true,
        );
    } else if (mode === "start" && base?.status === "not_started") {
      row = base;
      previous = await projectPreparationModel.previous(
        challengeId,
        base.attempt,
      );
      layout = projectLayout(dirname(base.projectPath), base.attempt);
      if (
        layout.projectRoot !== base.projectPath ||
        layout.projectDirectory !== base.projectDirectory
      )
        throw new AppError(
          "PROJECT_PREPARATION_INVALID",
          "The saved project preparation path is invalid. Start a fresh attempt.",
          409,
        );
      specification = base.specification;
      selection = specification.model.selection ?? selection;
    } else {
      previous = base;
      const workspace = await workspaces.ensure(challenge);
      if (challenge.workspacePath !== workspace.path) {
        await challenges.setWorkspacePath(challenge.id, workspace.path);
        challenge.workspacePath = workspace.path;
      }
      const created = await createProjectWorkspace({
        root: workspace.path,
        now,
      });
      const attempt = projectAttemptNumber(created.layout.projectDirectory)!;
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
      row = await projectPreparationModel.create({
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
      if (!row)
        throw new AppError(
          "PROJECT_PREPARATION_UNAVAILABLE",
          "Project preparation could not be recorded.",
          500,
          true,
        );
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
        mode === "resume"
          ? `Resumed attempt ${base!.attempt} in ${layout.projectDirectory}.`
          : mode === "retry"
            ? `Retried attempt ${base!.attempt} in ${layout.projectDirectory} with the saved frozen specification.`
            : mode === "fresh"
              ? `Started a fresh project folder from the saved frozen specification.`
              : "Scaffolding started.",
    });
    const running = await projectPreparationModel.markRunning(
      row.id,
      runToken,
      boundedActivity(activity),
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
      previous: mode === "fresh" ? undefined : previous,
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
        const active = activeRuns.get(challengeId);
        if (active && active.preparationId === target.id) {
          active.controller.abort();
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
      const pendingTransitions = [...transitions.values()];
      await projectPreparationModel.markInterrupted(now()).catch(() => {});
      await commands.recover().catch(() => {});
      for (const entry of activeRuns.values()) entry.controller.abort();
      if (pendingTransitions.length) await wait(pendingTransitions);
      // A start that was already in preflight may have scheduled while the
      // first pass ran. Fence and abort again before closing the database.
      await projectPreparationModel.markInterrupted(now()).catch(() => {});
      await commands.recover().catch(() => {});
      for (const entry of activeRuns.values()) entry.controller.abort();
      const running = [...activeRuns.values()].map((entry) => entry.promise);
      if (running.length) await wait(running);
    },
  };
}

export type ProjectPreparationService = ReturnType<
  typeof createProjectPreparationService
>;
