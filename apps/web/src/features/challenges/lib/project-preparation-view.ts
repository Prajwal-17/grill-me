import type {
  ProjectCheckExpectation,
  ProjectCheckIntent,
  ProjectCheckProposal,
  ProjectCheckResult,
  ProjectCommand,
  ProjectCommandProposal,
  ProjectCommandStatus,
  ProjectPreparation,
  ProjectPreparationActivity,
  ProjectPreparationMode,
  ProjectPreparationStatus,
} from "@repo/backend/shared/contracts";

export type ProjectTone =
  "neutral" | "muted" | "success" | "warning" | "danger";

export type ProjectFileView = {
  path: string;
  role: string;
  purpose: string | null;
};

export type ProjectTodoView = {
  path: string;
  line: number;
  note: string;
  location: string;
};

export type ProjectCommandView = {
  id: string;
  purpose: ProjectCommand["purpose"];
  label: string;
  command: string;
  cwd: string;
  install: boolean;
  network: boolean;
  status: ProjectCommandStatus | "not_run";
  statusLabel: string;
  statusTone: ProjectTone;
  exitCode: number | null;
  outputTail: string | null;
  outputTruncated: boolean;
  errorMessage: string | null;
  checkId: string | null;
};

export type ProjectCheckView = {
  id: string;
  label: string;
  kind: ProjectCheckProposal["kind"];
  intent: ProjectCheckIntent;
  expected: ProjectCheckExpectation;
  status: ProjectCheckResult["status"];
  statusLabel: string;
  tone: ProjectTone;
  detail: string | null;
  command: string | null;
  cwd: string;
};

export type ProjectCheckGroupView = {
  id: "setup" | "exercise";
  label: string;
  summary: string;
  tone: ProjectTone;
  checks: ProjectCheckView[];
};

export type ProjectActivityView = {
  key: string;
  label: string;
};

export type ProjectRecoveryActionView = {
  action: "resume" | "retry" | "fresh";
  label: string;
  description: string;
  enabled: boolean;
  primary: boolean;
};

export type ProjectRecoveryView = {
  title: string;
  description: string;
  tone: "warning" | "danger";
  needsReview: boolean;
  conflictPath: string | null;
  resumeMessage: string | null;
  missingFiles: string[];
  missingFileCount: number;
  settling: boolean;
  actions: ProjectRecoveryActionView[];
};

export type ProjectPreparationView = {
  status: ProjectPreparationStatus;
  statusLabel: string;
  statusTone: ProjectTone;
  mode: ProjectPreparationMode | null;
  modeLabel: string | null;
  attempt: number | null;
  previousAttempt: string | null;
  summary: string | null;
  projectDirectory: string | null;
  projectPath: string | null;
  workspacePath: string | null;
  files: ProjectFileView[];
  todos: ProjectTodoView[];
  filesSummary: string;
  checkGroups: ProjectCheckGroupView[];
  commands: ProjectCommandView[];
  awaitingApproval: boolean;
  authorization: {
    attempt: number;
    install: boolean;
    network: boolean;
  } | null;
  problems: string[];
  activity: ProjectActivityView[];
  lastActivity: ProjectActivityView | null;
  running: boolean;
  canStart: boolean;
  canCancel: boolean;
  startLabel: string;
  startExplanation: string | null;
  createsNewAttempt: boolean;
  recovery: ProjectRecoveryView | null;
};

const statusLabels: Record<ProjectPreparationStatus, string> = {
  not_started: "Not started",
  running: "Preparing",
  ready: "Files prepared",
  failed: "Preparation failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

const statusTones: Record<ProjectPreparationStatus, ProjectTone> = {
  not_started: "muted",
  running: "neutral",
  ready: "neutral",
  failed: "danger",
  cancelled: "warning",
  interrupted: "warning",
};

const modeLabels: Record<ProjectPreparationMode, string> = {
  start: "Started",
  retry: "Retried",
  resume: "Resumed",
  fresh: "Fresh start",
};

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function normalizedCwd(value: string) {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "." ? "." : trimmed;
}

function statusSummary(
  preparation: ProjectPreparation,
  reportSummary: string | null,
) {
  switch (preparation.status) {
    case "not_started":
      return "Generate project files, TODOs, and checks for this challenge.";
    case "running":
      return "Preparing project files in the background.";
    case "ready":
      return reportSummary ?? "Project files and checks are ready.";
    default:
      return null;
  }
}

function fileSummary(preparation: ProjectPreparation) {
  if (preparation.report)
    return `${plural(preparation.report.files.length, "file")} · ${plural(
      preparation.report.todos.length,
      "TODO",
    )}`;
  if (preparation.status === "running") return "Preparing…";
  if (preparation.status === "not_started") return "Not started";
  return "No completed inventory; partial files preserved";
}

function checkResultView(
  check: ProjectCheckProposal,
  result: ProjectCheckResult | undefined,
) {
  const status = result?.status ?? "not_run";
  if (check.expected === "fail") {
    if (status === "failed")
      return { status, label: "Failing as expected", tone: "muted" as const };
    if (status === "passed")
      return { status, label: "Passed unexpectedly", tone: "warning" as const };
    if (status === "blocked")
      return { status, label: "Blocked", tone: "warning" as const };
    return { status, label: "Not run", tone: "muted" as const };
  }
  if (status === "passed")
    return { status, label: "Passed", tone: "success" as const };
  if (status === "failed")
    return { status, label: "Failed", tone: "danger" as const };
  if (status === "blocked")
    return { status, label: "Blocked", tone: "warning" as const };
  return { status, label: "Not run", tone: "muted" as const };
}

function checkView(
  check: ProjectCheckProposal,
  result: ProjectCheckResult | undefined,
): ProjectCheckView {
  const state = checkResultView(check, result);
  return {
    id: check.id,
    label: check.label,
    kind: check.kind,
    intent: check.intent,
    expected: check.expected,
    status: state.status,
    statusLabel: state.label,
    tone: state.tone,
    detail: result?.detail ?? null,
    command: check.command,
    cwd: check.cwd,
  };
}

function groupSummary(checks: ProjectCheckView[]) {
  const unexpectedPasses = checks.filter(
    (check) => check.expected === "fail" && check.status === "passed",
  ).length;
  const failed = checks.filter(
    (check) => check.expected === "pass" && check.status === "failed",
  ).length;
  const blocked = checks.filter((check) => check.status === "blocked").length;
  const notRun = checks.filter((check) => check.status === "not_run").length;
  const expectedFailures = checks.filter(
    (check) => check.expected === "fail" && check.status === "failed",
  ).length;

  if (unexpectedPasses)
    return {
      summary: `${unexpectedPasses} passed unexpectedly`,
      tone: "warning" as const,
    };
  if (failed) return { summary: `${failed} failed`, tone: "danger" as const };
  if (blocked)
    return { summary: `${blocked} blocked`, tone: "warning" as const };
  if (notRun === checks.length)
    return { summary: `${checks.length} not run`, tone: "muted" as const };
  if (notRun)
    return {
      summary: `${checks.length - notRun} of ${checks.length} done`,
      tone: "neutral" as const,
    };
  if (expectedFailures === checks.length)
    return { summary: "Failing as expected", tone: "muted" as const };
  return { summary: "All passed", tone: "success" as const };
}

function checkGroups(report: ProjectPreparation["report"]) {
  if (!report) return [];
  const results = new Map(
    report.results.map((result) => [result.checkId, result]),
  );
  const setup = report.checks
    .filter((check) => check.intent === "verify")
    .map((check) => checkView(check, results.get(check.id)));
  const exercise = report.checks
    .filter((check) => check.intent === "todo_exercise")
    .map((check) => checkView(check, results.get(check.id)));
  const groups: ProjectCheckGroupView[] = [];
  for (const [id, label, checks] of [
    ["setup", "Setup checks", setup],
    ["exercise", "Exercise tests", exercise],
  ] as const) {
    if (!checks.length) continue;
    groups.push({ id, label, ...groupSummary(checks), checks });
  }
  return groups;
}

function commandStatusView(status: ProjectCommandStatus) {
  switch (status) {
    case "pending":
      return { label: "Waiting for approval", tone: "warning" as const };
    case "approved":
      return { label: "Approved", tone: "neutral" as const };
    case "running":
      return { label: "Running", tone: "neutral" as const };
    case "succeeded":
      return { label: "Succeeded", tone: "success" as const };
    case "failed":
      return { label: "Failed", tone: "danger" as const };
    case "timed_out":
      return { label: "Timed out", tone: "warning" as const };
    case "cancelled":
      return { label: "Cancelled", tone: "muted" as const };
    case "rejected":
      return { label: "Declined", tone: "muted" as const };
    case "interrupted":
      return { label: "Interrupted", tone: "warning" as const };
  }
}

function commandLabel(
  command: ProjectCommand,
  report: ProjectPreparation["report"],
) {
  if (command.purpose === "check") {
    const check = command.checkId
      ? report?.checks.find((entry) => entry.id === command.checkId)
      : undefined;
    return check?.label ?? "Check command";
  }
  if (command.purpose === "setup") return "Setup command";
  if (command.purpose === "run") return "Run command";
  return "Inspection command";
}

function proposedCommandView(
  proposal: Pick<
    ProjectCommandProposal,
    "label" | "command" | "cwd" | "install" | "network"
  >,
  purpose: "setup" | "check" | "run",
  id: string,
  checkId: string | null,
): ProjectCommandView {
  return {
    id,
    purpose,
    label: proposal.label,
    command: proposal.command,
    cwd: proposal.cwd || ".",
    install: proposal.install,
    network: proposal.network,
    status: "not_run",
    statusLabel: "Not run",
    statusTone: "muted",
    exitCode: null,
    outputTail: null,
    outputTruncated: false,
    errorMessage: null,
    checkId,
  };
}

function plannedCommandViews(report: ProjectPreparation["report"]) {
  if (!report) return [];
  return [
    ...report.setup.map((proposal, index) =>
      proposedCommandView(proposal, "setup", `planned-setup-${index}`, null),
    ),
    ...report.checks.flatMap((check, index) =>
      check.command
        ? [
            proposedCommandView(
              {
                label: check.label,
                command: check.command,
                cwd: check.cwd,
                install: check.install,
                network: check.network,
              },
              "check",
              `planned-check-${index}`,
              check.id,
            ),
          ]
        : [],
    ),
    ...report.run.map((proposal, index) =>
      proposedCommandView(proposal, "run", `planned-run-${index}`, null),
    ),
  ];
}

function sameCommand(
  actual: Pick<ProjectCommandView, "purpose" | "command" | "cwd" | "checkId">,
  planned: Pick<ProjectCommandView, "purpose" | "command" | "cwd" | "checkId">,
) {
  return (
    actual.purpose === planned.purpose &&
    actual.command.trim() === planned.command.trim() &&
    normalizedCwd(actual.cwd) === normalizedCwd(planned.cwd) &&
    (actual.checkId === null ||
      planned.checkId === null ||
      actual.checkId === planned.checkId)
  );
}

function commandViews(
  commands: ProjectCommand[],
  report: ProjectPreparation["report"],
) {
  const planned = plannedCommandViews(report);
  if (!commands.length) return planned;
  const actual: ProjectCommandView[] = commands.map((command) => {
    let state = commandStatusView(command.status);
    const check =
      command.purpose === "check" && command.checkId
        ? report?.checks.find((entry) => entry.id === command.checkId)
        : undefined;
    if (check?.expected === "fail") {
      if (command.status === "failed")
        state = { label: "Failing as expected", tone: "muted" };
      else if (command.status === "succeeded")
        state = { label: "Passed unexpectedly", tone: "warning" };
    }
    const output = command.result?.output ?? "";
    const boundedTail = output.slice(-4_000);
    return {
      id: command.id,
      purpose: command.purpose,
      label: commandLabel(command, report),
      command: command.command,
      cwd: command.cwd || ".",
      install: command.install,
      network: command.network,
      status: command.status,
      statusLabel: state.label,
      statusTone: state.tone,
      exitCode: command.result?.exitCode ?? null,
      outputTail: output ? boundedTail : null,
      outputTruncated: Boolean(
        command.result?.truncated || output.length > boundedTail.length,
      ),
      errorMessage: command.result?.error?.message ?? null,
      checkId: command.checkId,
    };
  });
  return [
    ...actual,
    ...planned.filter(
      (command) => !actual.some((executed) => sameCommand(executed, command)),
    ),
  ];
}

function activityLabel(activity: ProjectPreparationActivity) {
  switch (activity.type) {
    case "listed":
      return `Listed ${activity.path ?? "the project folder"}${
        activity.entries !== undefined
          ? ` · ${plural(activity.entries, "entry")}`
          : ""
      }`;
    case "read":
      return `Read ${activity.path ?? "a project file"}`;
    case "searched":
      return `Searched “${activity.query ?? ""}”${
        activity.matches !== undefined
          ? ` · ${plural(activity.matches, "match")}`
          : ""
      }`;
    case "created_directory":
      return `Created ${activity.path ?? "a folder"}/`;
    case "created_file":
      return `Created ${activity.path ?? "a project file"}`;
    case "edited_file":
      return `Updated ${activity.path ?? "a project file"}`;
    case "specification_saved":
      return "Saved CHALLENGE.md";
    case "started":
      return activity.message ?? "Preparation started";
    case "completed":
      return activity.message ?? "Preparation completed";
    case "failed":
      return activity.message ?? "Preparation failed";
    case "cancelled":
      return activity.message ?? "Preparation cancelled";
    case "interrupted":
      return activity.message ?? "Preparation interrupted";
  }
}

function activityViews(activity: ProjectPreparationActivity[]) {
  const groups: { type: string; count: number; label: string; key: string }[] =
    [];
  activity.forEach((entry, index) => {
    const current = groups.at(-1);
    if (
      current &&
      (entry.type === "read" || entry.type === "searched") &&
      current.type === entry.type
    ) {
      current.count += 1;
      current.label =
        entry.type === "read"
          ? `Read ${plural(current.count, "file")}`
          : `Searched ${current.count} ${current.count === 1 ? "query" : "queries"}`;
      return;
    }
    groups.push({
      type: entry.type,
      count: 1,
      label: activityLabel(entry),
      key: `${entry.type}-${index}`,
    });
  });
  return groups;
}

function lastActivityView(
  preparation: ProjectPreparation,
): ProjectActivityView | null {
  if (preparation.status === "not_started" || preparation.status === "running")
    return null;
  let terminal: ProjectPreparationActivity | undefined;
  for (let index = preparation.activity.length - 1; index >= 0; index--) {
    const entry = preparation.activity[index]!;
    if (
      entry.type === "completed" ||
      entry.type === "failed" ||
      entry.type === "cancelled" ||
      entry.type === "interrupted"
    ) {
      terminal = entry;
      break;
    }
  }
  const entry = terminal ?? preparation.activity.at(-1);
  if (!entry) return null;
  return { key: `last-${entry.type}`, label: activityLabel(entry) };
}

function recoveryView(
  preparation: ProjectPreparation,
): ProjectRecoveryView | null {
  const status = preparation.status;
  if (status !== "failed" && status !== "cancelled" && status !== "interrupted")
    return null;
  const recovery = preparation.recovery;
  const attempt = " Your project files are preserved.";
  const code = preparation.error?.code;
  const conflictPath =
    recovery.conflictPath ??
    (typeof preparation.error?.details?.path === "string"
      ? preparation.error.details.path
      : null);

  const title =
    status === "interrupted"
      ? "Preparation interrupted"
      : status === "cancelled"
        ? "Preparation cancelled"
        : code === "PROJECT_FILE_MODIFIED"
          ? "Stopped to preserve your edits"
          : "Preparation stopped";
  const folderAdvice = recovery.canResume
    ? " Resume continues this folder."
    : " Resume continues this folder, or start another folder without touching it.";
  const description =
    status === "interrupted"
      ? `The app stopped before preparation finished.${attempt}${folderAdvice}`
      : status === "cancelled"
        ? `Cancelled before the project was ready.${attempt}${folderAdvice}`
        : code === "PROJECT_FILE_MODIFIED"
          ? `A generated file changed on disk, so Grill Me did not overwrite it.${attempt} Resume is disabled for this folder; retry or start fresh in a new folder.`
          : `${preparation.error?.message ?? "Project preparation failed."}${attempt}`;

  // When the current folder can be trusted, continuing it is the only offered
  // path; retry and fresh remain fallbacks for folders resume cannot verify.
  const allActions: ProjectRecoveryActionView[] = [
    {
      action: "resume",
      label: "Continue setup",
      description:
        "Continues setting up this folder. Changed tracked files are never overwritten.",
      enabled: recovery.canResume,
      primary: recovery.canResume,
    },
    {
      action: "retry",
      label: "Retry in a new folder",
      description:
        "Continues the setup conversation in a new folder using the saved specification and earlier setup notes. Your edits here are not copied.",
      enabled: recovery.canRetry,
      primary: !recovery.canResume && recovery.canRetry,
    },
    {
      action: "fresh",
      label: "Start fresh",
      description:
        "Creates a new folder from the saved frozen specification without reading this folder's journal. Your files here stay untouched.",
      enabled: recovery.canFresh,
      primary: false,
    },
  ];
  const actions = recovery.canResume
    ? allActions.filter((action) => action.action === "resume")
    : allActions.filter((action) => action.action !== "resume");

  return {
    title,
    description,
    tone:
      status === "failed" && code !== "PROJECT_FILE_MODIFIED"
        ? "danger"
        : "warning",
    conflictPath,
    resumeMessage: recovery.resumeMessage,
    missingFiles: recovery.missingFiles,
    missingFileCount: recovery.missingFileCount,
    settling: recovery.settling,
    needsReview: true,
    actions,
  };
}

function previousAttemptLabel(preparation: ProjectPreparation) {
  const previous = preparation.previousAttempt;
  if (!previous) return null;
  const outcome = previous.summary ?? statusLabels[previous.status];
  if (
    preparation.mode === "resume" &&
    previous.projectDirectory === preparation.projectDirectory
  )
    return `Continued setup in the same folder (${previous.projectDirectory}).`;
  return `Earlier setup: ${outcome} (${previous.projectDirectory})`;
}

function projectWorkspacePath(preparation: ProjectPreparation) {
  const { projectPath, projectDirectory } = preparation;
  if (!projectPath || !projectDirectory) return null;
  for (const separator of ["/", "\\"]) {
    const suffix = `${separator}${projectDirectory}`;
    if (projectPath.endsWith(suffix))
      return projectPath.slice(0, -suffix.length);
  }
  return null;
}

export function projectPreparationView(
  preparation: ProjectPreparation,
): ProjectPreparationView {
  const attempted = preparation.attempt !== null;
  const running = preparation.status === "running";
  const createsNewAttempt =
    attempted &&
    (preparation.status === "failed" ||
      preparation.status === "cancelled" ||
      preparation.status === "interrupted");
  const canStart = preparation.status === "not_started";
  const report = preparation.report;
  const activities = activityViews(preparation.activity);
  const awaitingApproval =
    preparation.status === "running" &&
    preparation.commands.some((command) => command.status === "pending");
  return {
    status: preparation.status,
    statusLabel: awaitingApproval
      ? "Waiting for approval"
      : statusLabels[preparation.status],
    statusTone: awaitingApproval ? "warning" : statusTones[preparation.status],
    mode: preparation.mode,
    modeLabel: preparation.mode ? modeLabels[preparation.mode] : null,
    attempt: preparation.attempt,
    previousAttempt: previousAttemptLabel(preparation),
    summary: awaitingApproval
      ? "A command needs approval before preparation can continue."
      : statusSummary(preparation, report?.summary ?? null),
    projectDirectory: preparation.projectDirectory,
    projectPath: preparation.projectPath,
    workspacePath: projectWorkspacePath(preparation),
    files: (report?.files ?? []).map((file) => ({
      path: file.path,
      role: file.role,
      purpose: file.purpose,
    })),
    todos: (report?.todos ?? []).map((todo) => ({
      path: todo.path,
      line: todo.line,
      note: todo.note,
      location: `${todo.path}:${todo.line}`,
    })),
    filesSummary: fileSummary(preparation),
    checkGroups: checkGroups(report),
    commands: commandViews(preparation.commands, report),
    awaitingApproval,
    authorization: preparation.commandAuthorization
      ? {
          attempt: preparation.commandAuthorization.attempt,
          install: preparation.commandAuthorization.install,
          network: preparation.commandAuthorization.network,
        }
      : null,
    problems: report?.problems ?? [],
    activity: running ? activities.slice(-4).reverse() : [],
    lastActivity: lastActivityView(preparation),
    running,
    canStart,
    canCancel: running,
    startLabel: "Prepare project files",
    startExplanation:
      preparation.status === "not_started"
        ? "Creates the starter project, frozen challenge file, TODOs, and checks."
        : null,
    createsNewAttempt,
    recovery: recoveryView(preparation),
  };
}
