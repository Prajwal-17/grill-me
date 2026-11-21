import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  ProjectCheckProposal,
  ProjectCommand,
  ProjectCommandProposal,
  ProjectPreparation,
  ProjectPreparationActivity,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import { projectPreparationView } from "./project-preparation-view";

const at = "2026-11-14T10:00:00.000Z";

function activity(
  type: ProjectPreparationActivity["type"],
  extra: Partial<ProjectPreparationActivity> = {},
): ProjectPreparationActivity {
  return { type, at, ...extra };
}

function check(
  overrides: Partial<ProjectCheckProposal> &
    Pick<ProjectCheckProposal, "id" | "label">,
): ProjectCheckProposal {
  return {
    kind: "test",
    command: `bun test ${overrides.id}`,
    cwd: ".",
    install: false,
    network: false,
    intent: "verify",
    expected: "pass",
    ...overrides,
  };
}

function command(
  overrides: Partial<ProjectCommandProposal> &
    Pick<ProjectCommandProposal, "label" | "command">,
): ProjectCommandProposal {
  return { cwd: ".", install: false, network: false, ...overrides };
}

function projectCommand(
  overrides: Partial<ProjectCommand> &
    Pick<ProjectCommand, "id" | "purpose" | "command" | "status">,
): ProjectCommand {
  return {
    checkId: null,
    cwd: ".",
    install: false,
    network: false,
    timeoutMs: 30_000,
    authorization: null,
    result: null,
    createdAt: at,
    decidedAt: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function report(
  overrides: Partial<ProjectScaffoldReport> = {},
): ProjectScaffoldReport {
  return {
    summary: "Created a small task tracker with a deliberate TODO.",
    files: [
      {
        path: "src/index.ts",
        role: "source",
        purpose: "Task operations",
      },
      {
        path: "CHALLENGE.md",
        role: "documentation",
        purpose: null,
      },
    ],
    todos: [
      {
        path: "src/index.ts",
        line: 12,
        note: "Implement the reorder function.",
      },
    ],
    setup: [command({ label: "Install dependencies", command: "bun install" })],
    run: [command({ label: "Start the app", command: "bun run dev" })],
    checks: [
      check({ id: "typecheck", label: "Types compile", kind: "typecheck" }),
      check({
        id: "reorder",
        label: "Exercise reorder",
        intent: "todo_exercise",
        expected: "fail",
      }),
    ],
    results: [
      { checkId: "typecheck", status: "not_run", detail: null },
      { checkId: "reorder", status: "not_run", detail: null },
    ],
    problems: [],
    ...overrides,
  };
}

function preparation(
  overrides: Partial<ProjectPreparation> = {},
): ProjectPreparation {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    challengeId: "22222222-2222-4222-8222-222222222222",
    attempt: 1,
    projectDirectory: "project",
    projectPath: "/practice/challenge/project",
    mode: "start",
    status: "ready",
    specification: null,
    report: report(),
    activity: [activity("completed", { message: "Project files are ready." })],
    commands: [],
    commandAuthorization: null,
    error: null,
    requestedModel: null,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
    recovery: {
      canRetry: false,
      canResume: false,
      canFresh: false,
      settling: false,
      resumeStatus: "not_applicable",
      resumeMessage: null,
      conflictPath: null,
      missingFiles: [],
      missingFileCount: 0,
    },
    previousAttempt: null,
    ...overrides,
  };
}

test("reports not started projects as ready to prepare", () => {
  const view = projectPreparationView(
    preparation({
      id: null,
      attempt: null,
      projectDirectory: null,
      projectPath: null,
      status: "not_started",
      report: null,
      activity: [],
      startedAt: null,
      completedAt: null,
      updatedAt: null,
    }),
  );
  assert.equal(view.statusLabel, "Not started");
  assert.equal(view.statusTone, "muted");
  assert.equal(view.canStart, true);
  assert.equal(view.canCancel, false);
  assert.equal(view.startLabel, "Prepare project files");
  assert.equal(view.createsNewAttempt, false);
  assert.equal(view.filesSummary, "Not started");
  assert.deepEqual(view.activity, []);
  assert.equal(view.recovery, null);
});

test("groups current reads and searches into at most four latest rows", () => {
  const view = projectPreparationView(
    preparation({
      status: "running",
      report: null,
      completedAt: null,
      activity: [
        activity("listed", { path: ".", entries: 4 }),
        activity("read", { path: "src/a.ts" }),
        activity("read", { path: "src/b.ts" }),
        activity("searched", { query: "TODO", matches: 1 }),
        activity("created_file", { path: "src/c.ts" }),
        activity("edited_file", { path: "src/d.ts" }),
        activity("specification_saved"),
      ],
    }),
  );
  assert.equal(view.statusLabel, "Preparing");
  assert.equal(view.running, true);
  assert.equal(view.canCancel, true);
  assert.equal(view.canStart, false);
  assert.equal(view.activity.length, 4);
  assert.equal(view.activity[0]?.label, "Saved CHALLENGE.md");
  assert.equal(view.activity[1]?.label, "Updated src/d.ts");
  assert.equal(view.activity[2]?.label, "Created src/c.ts");
  assert.equal(view.activity[3]?.label, "Searched “TODO” · 1 match");
  assert.equal(view.lastActivity, null);
});

test("keeps expected exercise failures muted and never green", () => {
  const view = projectPreparationView(
    preparation({
      report: report({
        results: [
          { checkId: "typecheck", status: "passed", detail: "No errors." },
          { checkId: "reorder", status: "failed", detail: "Expected failure." },
        ],
      }),
    }),
  );
  const setup = view.checkGroups.find((group) => group.id === "setup");
  const exercise = view.checkGroups.find((group) => group.id === "exercise");
  assert.equal(setup?.summary, "All passed");
  assert.equal(setup?.tone, "success");
  assert.equal(setup?.checks[0]?.statusLabel, "Passed");
  assert.equal(exercise?.summary, "Failing as expected");
  assert.equal(exercise?.tone, "muted");
  assert.equal(exercise?.checks[0]?.statusLabel, "Failing as expected");
  assert.equal(exercise?.checks[0]?.tone, "muted");
  assert.equal(view.statusLabel, "Files prepared");
  assert.equal(view.statusTone, "neutral");
  assert.equal(view.canStart, false);
});

test("warns when an unfinished exercise check passes unexpectedly", () => {
  const view = projectPreparationView(
    preparation({
      report: report({
        results: [
          { checkId: "typecheck", status: "not_run", detail: null },
          { checkId: "reorder", status: "passed", detail: null },
        ],
      }),
    }),
  );
  const exercise = view.checkGroups.find((group) => group.id === "exercise");
  assert.equal(exercise?.summary, "1 passed unexpectedly");
  assert.equal(exercise?.tone, "warning");
  assert.equal(exercise?.checks[0]?.statusLabel, "Passed unexpectedly");
  assert.equal(exercise?.checks[0]?.tone, "warning");
});

test("shows distinct setup and exercise groups with unrun checks muted", () => {
  const view = projectPreparationView(preparation());
  assert.deepEqual(
    view.checkGroups.map((group) => group.label),
    ["Setup checks", "Exercise tests"],
  );
  assert.equal(view.checkGroups[0]?.summary, "1 not run");
  assert.equal(view.checkGroups[0]?.tone, "muted");
  assert.equal(view.checkGroups[1]?.summary, "1 not run");
  assert.equal(view.checkGroups[1]?.tone, "muted");
});

test("groups consecutive searches without showing a log history", () => {
  const view = projectPreparationView(
    preparation({
      status: "running",
      report: null,
      completedAt: null,
      activity: [
        activity("searched", { query: "first", matches: 1 }),
        activity("searched", { query: "second", matches: 2 }),
        activity("searched", { query: "third", matches: 3 }),
      ],
    }),
  );
  assert.deepEqual(
    view.activity.map((entry) => entry.label),
    ["Searched 3 queries"],
  );
});

test("uses the published status labels", () => {
  const labels = {
    not_started: "Not started",
    running: "Preparing",
    ready: "Files prepared",
    failed: "Preparation failed",
    cancelled: "Cancelled",
    interrupted: "Interrupted",
  } as const;
  for (const [status, label] of Object.entries(labels)) {
    const view = projectPreparationView(
      preparation({
        status: status as keyof typeof labels,
        report: null,
        error:
          status === "failed"
            ? {
                code: "PROJECT_PREPARATION_FAILED",
                message: "Stopped.",
                retryable: true,
              }
            : null,
      }),
    );
    if (status === "running") continue;
    assert.equal(view.statusLabel, label);
  }
});

test("labels legacy report proposals as not run instead of waiting for approval", () => {
  const view = projectPreparationView(preparation());
  assert.equal(view.awaitingApproval, false);
  assert.deepEqual(
    view.commands.map((command) => [
      command.purpose,
      command.statusLabel,
      command.command,
    ]),
    [
      ["setup", "Not run", "bun install"],
      ["check", "Not run", "bun test typecheck"],
      ["check", "Not run", "bun test reorder"],
      ["run", "Not run", "bun run dev"],
    ],
  );
});

test("keeps expected failing check commands muted", () => {
  const view = projectPreparationView(
    preparation({
      commands: [
        projectCommand({
          id: "11111111-1111-4111-8111-111111111114",
          purpose: "check",
          checkId: "reorder",
          command: "bun test reorder",
          status: "failed",
          result: {
            status: "failed",
            started: true,
            exitCode: 1,
            signal: null,
            output: "expected failure",
            outputBytes: 17,
            truncated: false,
            timedOut: false,
            cancelled: false,
            durationMs: 40,
            error: null,
          },
        }),
      ],
    }),
  );
  assert.equal(view.commands[0]?.statusLabel, "Failing as expected");
  assert.equal(view.commands[0]?.statusTone, "muted");
  assert.equal(view.commands[0]?.exitCode, 1);
});

test("exposes attempt-wide command authorization without a timestamp", () => {
  const view = projectPreparationView(
    preparation({
      commandAuthorization: {
        attempt: 2,
        install: true,
        network: false,
        approvedAt: at,
      },
    }),
  );
  assert.deepEqual(view.authorization, {
    attempt: 2,
    install: true,
    network: false,
  });
});

test("maps exact command fields and bounded output", () => {
  const output = `${"x".repeat(4_100)}tail`;
  const view = projectPreparationView(
    preparation({
      status: "running",
      completedAt: null,
      commands: [
        projectCommand({
          id: "11111111-1111-4111-8111-111111111112",
          purpose: "setup",
          command: "bun install",
          status: "succeeded",
          authorization: "attempt",
          result: {
            status: "succeeded",
            started: true,
            exitCode: 0,
            signal: null,
            output,
            outputBytes: output.length,
            truncated: false,
            timedOut: false,
            cancelled: false,
            durationMs: 120,
            error: null,
          },
        }),
        projectCommand({
          id: "11111111-1111-4111-8111-111111111113",
          purpose: "check",
          checkId: "typecheck",
          command: "bun test typecheck",
          status: "pending",
        }),
      ],
    }),
  );
  assert.equal(view.filesSummary, "2 files · 1 TODO");
  assert.equal(view.workspacePath, "/practice/challenge");
  assert.deepEqual(
    view.files.map((file) => file.path),
    ["src/index.ts", "CHALLENGE.md"],
  );
  assert.deepEqual(view.todos, [
    {
      path: "src/index.ts",
      line: 12,
      note: "Implement the reorder function.",
      location: "src/index.ts:12",
    },
  ]);
  assert.equal(view.commands[0]?.label, "Setup command");
  assert.equal(view.commands[0]?.statusLabel, "Succeeded");
  assert.equal(view.commands[0]?.exitCode, 0);
  assert.equal(view.commands[0]?.outputTail?.length, 4_000);
  assert.match(view.commands[0]?.outputTail ?? "", /tail$/);
  assert.equal(view.commands[0]?.outputTruncated, true);
  assert.equal(view.commands[1]?.label, "Types compile");
  assert.equal(view.commands[1]?.statusLabel, "Waiting for approval");
  assert.equal(view.commands[1]?.statusTone, "warning");
  assert.equal(view.awaitingApproval, true);
  assert.equal(view.statusLabel, "Waiting for approval");
  assert.equal(view.statusTone, "warning");
  assert.match(view.summary ?? "", /needs approval/);
});

test("offers explicit recovery actions without claiming an unsafe resume", () => {
  const view = projectPreparationView(
    preparation({
      status: "failed",
      report: null,
      completedAt: at,
      activity: [
        activity("failed", {
          message: "Preparation failed. Partial files are preserved.",
        }),
      ],
      error: {
        code: "PROJECT_FILE_MODIFIED",
        message: "That project file changed after Grill Me wrote it.",
        retryable: true,
        details: { path: "src/index.ts" },
      },
      recovery: {
        canRetry: true,
        canResume: false,
        canFresh: true,
        settling: false,
        resumeStatus: "file_modified",
        resumeMessage:
          "A tracked project file changed on disk. Resume did not start.",
        conflictPath: "src/index.ts",
        missingFiles: [],
        missingFileCount: 0,
      },
    }),
  );
  assert.equal(view.statusLabel, "Preparation failed");
  assert.equal(view.statusTone, "danger");
  assert.equal(view.recovery?.title, "Stopped to preserve your edits");
  assert.equal(view.recovery?.tone, "warning");
  assert.equal(view.recovery?.conflictPath, "src/index.ts");
  assert.match(view.recovery?.description ?? "", /Resume is disabled/);
  assert.match(view.recovery?.resumeMessage ?? "", /Resume did not start/);
  assert.deepEqual(
    view.recovery?.actions.map((action) => [
      action.action,
      action.enabled,
      action.primary,
    ]),
    [
      ["retry", true, true],
      ["fresh", true, false],
    ],
  );
  assert.match(view.recovery?.actions[0]?.description ?? "", /not copied/);
  assert.match(
    view.recovery?.actions[1]?.description ?? "",
    /without reading this folder's journal/,
  );
  assert.equal(view.canStart, false);
});

test("offers resume for an interrupted attempt with valid journal metadata", () => {
  const view = projectPreparationView(
    preparation({
      status: "interrupted",
      report: null,
      error: {
        code: "PROJECT_PREPARATION_INTERRUPTED",
        message: "The app stopped before project preparation finished.",
        retryable: true,
      },
      recovery: {
        canRetry: true,
        canResume: true,
        canFresh: true,
        settling: false,
        resumeStatus: "available",
        resumeMessage: null,
        conflictPath: null,
        missingFiles: ["src/wiring.ts"],
        missingFileCount: 1,
      },
    }),
  );
  assert.equal(view.recovery?.title, "Preparation interrupted");
  assert.equal(view.recovery?.missingFileCount, 1);
  assert.deepEqual(view.recovery?.missingFiles, ["src/wiring.ts"]);
  assert.deepEqual(
    view.recovery?.actions.map((action) => [
      action.action,
      action.enabled,
      action.primary,
    ]),
    [["resume", true, true]],
  );
  assert.match(
    view.recovery?.description ?? "",
    /Resume continues this folder\./,
  );
});

test("keeps retry and fresh disabled while a previous run is settling", () => {
  const view = projectPreparationView(
    preparation({
      status: "cancelled",
      report: null,
      recovery: {
        canRetry: false,
        canResume: false,
        canFresh: false,
        settling: true,
        resumeStatus: "settling",
        resumeMessage: null,
        conflictPath: null,
        missingFiles: [],
        missingFileCount: 0,
      },
    }),
  );
  assert.equal(view.recovery?.settling, true);
  assert.equal(
    view.recovery?.actions.every((action) => !action.enabled),
    true,
  );
});

test("labels resumed attempts and their same-folder history honestly", () => {
  const view = projectPreparationView(
    preparation({
      status: "running",
      mode: "resume",
      report: null,
      completedAt: null,
      previousAttempt: {
        attempt: 1,
        status: "interrupted",
        projectDirectory: "project",
        summary: null,
      },
    }),
  );
  assert.equal(view.mode, "resume");
  assert.equal(view.modeLabel, "Resumed");
  assert.equal(
    view.previousAttempt,
    "Continued setup in the same folder (project).",
  );
});

test("describes terminal attempts without a completed inventory truthfully", () => {
  const view = projectPreparationView(
    preparation({
      status: "interrupted",
      report: null,
      recovery: {
        canRetry: true,
        canResume: true,
        canFresh: true,
        settling: false,
        resumeStatus: "available",
        resumeMessage: null,
        conflictPath: null,
        missingFiles: [],
        missingFileCount: 0,
      },
    }),
  );
  assert.equal(
    view.filesSummary,
    "No completed inventory; partial files preserved",
  );
  assert.deepEqual(view.checkGroups, []);
});

test("keeps the latest terminal activity bounded to one row", () => {
  const view = projectPreparationView(
    preparation({
      status: "ready",
      activity: [
        activity("created_file", { path: "src/index.ts" }),
        activity("completed", { message: "Project files are ready." }),
        activity("edited_file", { path: "src/index.ts" }),
      ],
    }),
  );
  assert.equal(view.activity.length, 0);
  assert.equal(view.lastActivity?.label, "Project files are ready.");
});

test("does not expose model or timing metrics in the view", () => {
  const view = projectPreparationView(preparation());
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /requestedModel/);
  assert.doesNotMatch(serialized, /startedAt/);
  assert.doesNotMatch(serialized, /completedAt/);
  assert.doesNotMatch(serialized, /updatedAt/);
});
