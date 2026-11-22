import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { createApp } from "@repo/backend/app";
import { createPiGateway } from "@repo/backend/modules/ai/agent/gateway";
import { runStructured } from "@repo/backend/modules/ai/agent/runtime";
import {
  createProjectTools,
  projectToolJournalContext,
} from "@repo/backend/modules/ai/agent/tools/project";
import { createProjectWorkspace } from "@repo/backend/modules/challenges/project-workspace";
import { writeFrozenSpecification } from "@repo/backend/modules/challenges/project-preparation.spec";
import type {
  BuildModelInput,
  ModelGateway,
  ProjectScaffoldModelInput,
} from "@repo/backend/modules/ai/model-gateway";
import type {
  Challenge,
  ChallengePreparation,
  GeneratedBuildContent,
} from "@repo/backend/modules/challenges/challenge.schema";
import type {
  ProjectCommand,
  ProjectCommandResult,
  ProjectFrozenSpecification,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import { migrateDatabase } from "@repo/backend/shared/database/db";
import { setHarnessPermissionModeProvider } from "@repo/backend/modules/harness/harness.service";
import { resolvedModel } from "./fixtures/agent-fixtures";

await migrateDatabase();
setHarnessPermissionModeProvider(() => "auto-accept-edits");

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "grill-project-command-auth-"));
  roots.push(root);
  return root;
}

const generatedBuild: GeneratedBuildContent = {
  title: "URL shortener service",
  estimatedDifficultyBand: "medium",
  difficultyReason: "Requires bounded API and storage reasoning.",
  topic: "TypeScript",
  implementationBoundary: "Build the HTTP handlers and storage boundary.",
  durationEstimate: { minMinutes: 45, maxMinutes: 75 },
  implementationMilestones: [],
  problemStatement:
    "Build a URL shortener service with separate HTTP, storage, migration, and test files.",
  expectedOutcome: "A runnable project skeleton with unfinished core logic.",
  completionCriteria: [
    "Creates a short link and stores its target.",
    "Redirects a known short link.",
  ],
};

const projectFiles = [
  {
    path: "package.json",
    role: "config" as const,
    content: JSON.stringify(
      { name: "url-shortener", private: true, scripts: { test: "bun test" } },
      null,
      2,
    ),
  },
  {
    path: "src/shortener.ts",
    role: "source" as const,
    content:
      '// TODO: implement the deterministic slug and storage boundary.\nexport function createShortLink(_target: string) {\n  throw new Error("TODO");\n}\n',
  },
  {
    path: "src/app.ts",
    role: "source" as const,
    content:
      'import { createShortLink } from "./shortener";\n\nexport function handleCreate(target: string) {\n  return createShortLink(target);\n}\n',
  },
  {
    path: "migrations/001_links.sql",
    role: "migration" as const,
    content:
      "CREATE TABLE links (slug TEXT PRIMARY KEY, target TEXT NOT NULL);\n",
  },
  {
    path: "test/shortener.test.ts",
    role: "test" as const,
    content:
      'import { test } from "bun:test";\n\ntest("unfinished", () => {\n  throw new Error("TODO exercise");\n});\n',
  },
  {
    path: "README.md",
    role: "documentation" as const,
    content: "# URL shortener\n\nImplement the TODO exercise.\n",
  },
];

type Behavior =
  | "success"
  | "reject"
  | "attempt"
  | "fail"
  | "cancel"
  | "fraud"
  | "fraud-no-run"
  | "duplicate";

const todoCommand = "bun test test/shortener.test.ts";

function report(
  checkCommand: string,
  status: "passed" | "failed" | "not_run",
  todoStatus: "failed" | "not_run" = "failed",
) {
  return {
    summary: "Created the URL shortener scaffold with a TODO exercise.",
    files: projectFiles.map((file) => ({
      path: file.path,
      role: file.role,
      purpose: null,
    })),
    todos: [
      {
        path: "src/shortener.ts",
        line: 1,
        note: "Implement short-link creation.",
      },
    ],
    setup: [],
    run: [],
    checks: [
      {
        id: "verify",
        label: "Verify the supporting wiring",
        kind: "test" as const,
        command: checkCommand,
        cwd: ".",
        install: false,
        network: false,
        intent: "verify" as const,
        expected: "pass" as const,
      },
      {
        id: "todo",
        label: "Run the intentionally failing TODO exercise",
        kind: "test" as const,
        command: todoCommand,
        cwd: ".",
        install: false,
        network: false,
        intent: "todo_exercise" as const,
        expected: "fail" as const,
      },
    ],
    results: [
      { checkId: "verify", status, detail: null },
      { checkId: "todo", status: todoStatus, detail: null },
    ],
    problems: [],
  } satisfies ProjectScaffoldReport;
}

class FakeCommandScaffoldModel implements ModelGateway {
  inputs: ProjectScaffoldModelInput[] = [];
  behavior: Behavior = "success";
  checkCommand = "bun -e \"console.log('verify')\"";

  async prepareBuild(): Promise<ChallengePreparation> {
    return { question: null, options: [] };
  }

  async generateBuild(input: BuildModelInput) {
    return {
      status: "ready" as const,
      challenge: {
        ...generatedBuild,
        estimatedDifficultyBand: input.difficulty,
      },
      question: null,
      options: [],
    };
  }

  async *respond() {
    yield "";
  }

  async *generateHint() {
    yield "";
  }

  private async writeFiles(input: ProjectScaffoldModelInput) {
    const create = createProjectTools({
      root: input.layout.projectRoot,
      journal: projectToolJournalContext(input.layout),
      signal: input.signal,
    }).find((tool) => tool.name === "create_project_file")!;
    for (const file of projectFiles)
      await create.execute(
        "call",
        { path: file.path, content: file.content },
        undefined,
      );
  }

  private async runTodo(
    input: ProjectScaffoldModelInput,
  ): Promise<"failed" | "not_run"> {
    const run = input.runProjectCommand;
    if (!run) throw new Error("Authorized command tool was not supplied.");
    const result = await run(
      {
        purpose: "check",
        checkId: "todo",
        command: todoCommand,
        cwd: ".",
        install: false,
        network: false,
      },
      { preauthorized: true },
    );
    return result.status === "failed" ? "failed" : "not_run";
  }

  async scaffoldProject(
    input: ProjectScaffoldModelInput,
  ): Promise<ProjectScaffoldReport> {
    this.inputs.push(input);
    await this.writeFiles(input);
    const run = input.runProjectCommand;
    if (!run) throw new Error("Authorized command tool was not supplied.");
    const command = {
      purpose: "check" as const,
      checkId: "verify",
      command: this.checkCommand,
      cwd: ".",
      install: false,
      network: false,
    };
    switch (this.behavior) {
      case "reject": {
        const result = await run(command);
        expect(result.status).toBe("rejected");
        return report(this.checkCommand, "not_run", await this.runTodo(input));
      }
      case "attempt": {
        const setup = await run({
          purpose: "setup",
          command: "bun -e \"console.log('setup')\"",
          cwd: ".",
          install: true,
          network: true,
        });
        expect(setup.status).toBe("succeeded");
        const result = await run(command);
        expect(result.status).toBe("succeeded");
        return report(this.checkCommand, "passed", await this.runTodo(input));
      }
      case "fraud": {
        await run(command);
        return report(this.checkCommand, "failed", await this.runTodo(input));
      }
      case "fraud-no-run":
        return report(this.checkCommand, "passed", "not_run");
      case "cancel": {
        await run(command);
        return report(this.checkCommand, "passed", "not_run");
      }
      case "duplicate": {
        const result = await run(command);
        expect(result.status).toBe("succeeded");
        return report(this.checkCommand, "passed", await this.runTodo(input));
      }
      default: {
        const result = await run(command);
        const status =
          result.status === "succeeded"
            ? "passed"
            : result.status === "failed"
              ? "failed"
              : "not_run";
        return report(this.checkCommand, status, await this.runTodo(input));
      }
    }
  }
}

type TestApp = ReturnType<typeof createApp>;

async function json<T>(response: Response) {
  return (await response.json()) as T;
}

async function startProfile(app: TestApp, email: string) {
  const response = await app.request("/profiles/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  expect(response.status).toBe(200);
  return (await json<{ data: { id: string } }>(response)).data;
}

function request(
  app: TestApp,
  path: string,
  profileId: string,
  body?: unknown,
) {
  return app.request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Profile-Id": profileId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createChallenge(app: TestApp, profileId: string) {
  const response = await request(app, "/challenges/generate", profileId, {
    prompt:
      "Build a URL shortener with separate HTTP, storage, migration, and test files",
    scope: "feature",
    difficulty: "medium",
    clarificationContext: null,
  });
  expect(response.status).toBe(201);
  return (await json<{ data: Challenge }>(response)).data;
}

type PreparationState = {
  id: string | null;
  attempt: number | null;
  status: string;
  projectPath: string | null;
  commands: ProjectCommand[];
  commandAuthorization: {
    attempt: number;
    install: boolean;
    network: boolean;
  } | null;
  report: ProjectScaffoldReport | null;
  error: { code: string; message: string } | null;
};

async function preparation(
  app: TestApp,
  profileId: string,
  challengeId: string,
) {
  const response = await request(
    app,
    `/challenges/${challengeId}/project-preparation`,
    profileId,
  );
  expect(response.status).toBe(200);
  return (await json<{ data: PreparationState }>(response)).data;
}

async function waitForPreparation(
  app: TestApp,
  profileId: string,
  challengeId: string,
  expected: string[],
  timeout = 8_000,
) {
  const end = Date.now() + timeout;
  let last = await preparation(app, profileId, challengeId);
  while (Date.now() < end) {
    if (expected.includes(last.status)) return last;
    await Bun.sleep(20);
    last = await preparation(app, profileId, challengeId);
  }
  throw new Error(
    `Preparation did not reach ${expected.join("/")}; last ${last.status}: ${JSON.stringify(last.error)}`,
  );
}

async function waitForCommand(
  app: TestApp,
  profileId: string,
  challengeId: string,
  expected: string[],
  timeout = 8_000,
) {
  const end = Date.now() + timeout;
  let last = await preparation(app, profileId, challengeId);
  while (Date.now() < end) {
    const command = last.commands.find((entry) =>
      expected.includes(entry.status),
    );
    if (command) return { preparation: last, command };
    await Bun.sleep(20);
    last = await preparation(app, profileId, challengeId);
  }
  throw new Error(
    `No command reached ${expected.join("/")}; last ${last.status}`,
  );
}

function appWith(model: FakeCommandScaffoldModel, root: string) {
  return createApp({
    llm: model,
    workspaceRoot: () => join(root, "workspaces"),
  });
}

async function approve(
  app: TestApp,
  profileId: string,
  challengeId: string,
  commandId: string,
) {
  return request(
    app,
    `/challenges/${challengeId}/project-preparation/commands/${commandId}/approve`,
    profileId,
    {},
  );
}

async function reject(
  app: TestApp,
  profileId: string,
  challengeId: string,
  commandId: string,
) {
  return request(
    app,
    `/challenges/${challengeId}/project-preparation/commands/${commandId}/reject`,
    profileId,
    {},
  );
}

describe("authorized scaffold commands", () => {
  test("persists an exact pending request, enforces ownership, and runs only after individual approval", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-owner-${crypto.randomUUID()}@test.dev`,
    );
    const stranger = await startProfile(
      app,
      `command-stranger-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    const command = pending.command;
    expect(command.command).toBe(model.checkCommand);
    expect(command.cwd).toBe(".");
    expect(command.install).toBe(false);
    expect(command.network).toBe(false);
    expect(command.authorization).toBeNull();
    expect(command.result).toBeNull();

    const denied = await request(
      app,
      `/challenges/${challenge.id}/project-preparation`,
      stranger.id,
    );
    expect(denied.status).toBe(404);
    const deniedApproval = await approve(
      app,
      stranger.id,
      challenge.id,
      command.id,
    );
    expect(deniedApproval.status).toBe(404);

    // Reconnecting reads the same pending capability without any inference.
    const again = await preparation(app, owner.id, challenge.id);
    expect(again.commands[0]?.id).toBe(command.id);
    expect(again.commands[0]?.status).toBe("pending");

    const approved = await approve(app, owner.id, challenge.id, command.id);
    expect(approved.status).toBe(200);
    const ready = await waitForPreparation(app, owner.id, challenge.id, [
      "ready",
    ]);
    expect(ready.report?.results[0]?.status).toBe("passed");
    const executed = ready.commands.find((entry) => entry.id === command.id)!;
    expect(executed.status).toBe("succeeded");
    expect(executed.authorization).toBe("individual");
    expect(executed.result?.status).toBe("succeeded");
    expect(executed.result?.started).toBe(true);
    expect(executed.result?.output).toContain("verify");
  });

  test("rejecting a pending command never starts it and leaves the check not run", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "reject";
    model.checkCommand =
      "bun -e \"require('fs').writeFileSync('rejected-marker.txt', 'ran')\"";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-reject-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    const rejected = await reject(
      app,
      owner.id,
      challenge.id,
      pending.command.id,
    );
    expect(rejected.status).toBe(200);
    const ready = await waitForPreparation(app, owner.id, challenge.id, [
      "ready",
    ]);
    expect(ready.commands[0]?.status).toBe("rejected");
    expect(ready.commands[0]?.result).toBeNull();
    expect(ready.report?.results[0]?.status).toBe("not_run");
    const marker = join(ready.projectPath!, "rejected-marker.txt");
    await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("attempt-wide authorization covers explicit install and network scope for later commands", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "attempt";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-attempt-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    expect(pending.command.install).toBe(true);
    expect(pending.command.network).toBe(true);

    const authorization = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/command-authorization`,
      owner.id,
      { install: true, network: true },
    );
    expect(authorization.status).toBe(200);
    const ready = await waitForPreparation(app, owner.id, challenge.id, [
      "ready",
    ]);
    expect(ready.commandAuthorization).toMatchObject({
      attempt: 1,
      install: true,
      network: true,
    });
    expect(
      ready.commands.filter((command) => command.checkId !== "todo"),
    ).toHaveLength(2);
    expect(
      ready.commands
        .filter((command) => command.checkId !== "todo")
        .every(
          (command) =>
            command.status === "succeeded" &&
            command.authorization === "attempt",
        ),
    ).toBe(true);
    expect(ready.report?.results[0]?.status).toBe("passed");
  });

  test("attempt authorization does not widen install or network scope", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "attempt";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-scope-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    const authorization = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/command-authorization`,
      owner.id,
      { install: false, network: false },
    );
    expect(authorization.status).toBe(200);
    await Bun.sleep(100);
    const stillPending = await preparation(app, owner.id, challenge.id);
    expect(
      stillPending.commands.find((entry) => entry.id === pending.command.id)
        ?.status,
    ).toBe("pending");

    await approve(app, owner.id, challenge.id, pending.command.id);
    const ready = await waitForPreparation(app, owner.id, challenge.id, [
      "ready",
    ]);
    const setup = ready.commands.find(
      (command) => command.id === pending.command.id,
    )!;
    const check = ready.commands.find(
      (command) => command.id !== pending.command.id,
    )!;
    expect(setup.authorization).toBe("individual");
    expect(check.authorization).toBe("attempt");
    expect(ready.report?.results[0]?.status).toBe("passed");
  });

  test("records a failed preparation check and retains the prepared files", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "fail";
    model.checkCommand = 'bun -e "process.exit(7)"';
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-fail-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    expect(
      (await approve(app, owner.id, challenge.id, pending.command.id)).status,
    ).toBe(200);
    const failed = await waitForPreparation(app, owner.id, challenge.id, [
      "failed",
    ]);
    const executed = failed.commands[0]!;
    expect(executed.status).toBe("failed");
    expect(executed.result?.status).toBe("failed");
    expect(executed.result?.exitCode).toBe(7);
    expect(failed.report?.results[0]?.status).toBe("failed");
    expect(failed.report?.blockingProblems).toEqual([
      "Preparation check failed: Verify the supporting wiring",
    ]);
  });

  test("cancellation stops the active command and a stale approval cannot run it", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "cancel";
    model.checkCommand = 'bun -e "setTimeout(() => {}, 15000)"';
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-cancel-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    expect(
      (await approve(app, owner.id, challenge.id, pending.command.id)).status,
    ).toBe(200);
    const running = await waitForCommand(app, owner.id, challenge.id, [
      "running",
    ]);
    const response = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/cancel`,
      owner.id,
      {},
    );
    expect(response.status).toBe(200);
    const cancelled = await waitForPreparation(app, owner.id, challenge.id, [
      "cancelled",
    ]);
    expect(cancelled.commands[0]?.status).toBe("cancelled");
    const stale = await approve(
      app,
      owner.id,
      challenge.id,
      running.command.id,
    );
    expect(stale.status).toBe(409);
    expect((await json<{ error: { code: string } }>(stale)).error.code).toBe(
      "PROJECT_COMMAND_STALE",
    );
  });

  test("records a failed check honestly and rejects a fabricated result", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "fraud";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-fraud-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    await approve(app, owner.id, challenge.id, pending.command.id);
    const failed = await waitForPreparation(app, owner.id, challenge.id, [
      "failed",
    ]);
    expect(failed.error?.code).toBe("PROJECT_SCAFFOLD_INVALID");
    expect(failed.error?.message).toContain("actual execution");
  });

  test("rejects a passed result with no server execution record", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "fraud-no-run";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-fraud-none-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const failed = await waitForPreparation(app, owner.id, challenge.id, [
      "failed",
    ]);
    expect(failed.error?.code).toBe("PROJECT_SCAFFOLD_INVALID");
    expect(failed.error?.message).toContain("no matching server command");
  });

  test("double approval claims a command once and never duplicates execution", async () => {
    const root = await tempRoot();
    const model = new FakeCommandScaffoldModel();
    model.behavior = "duplicate";
    model.checkCommand =
      "bun -e \"require('fs').appendFileSync('run-count.txt', 'x')\"";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `command-duplicate-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    const [first, second] = await Promise.all([
      approve(app, owner.id, challenge.id, pending.command.id),
      approve(app, owner.id, challenge.id, pending.command.id),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 200]);
    const ready = await waitForPreparation(app, owner.id, challenge.id, [
      "ready",
    ]);
    expect(
      ready.commands.filter((command) => command.checkId === "verify"),
    ).toHaveLength(1);
    expect(ready.commands).toHaveLength(2);
    expect(
      await readFile(join(ready.projectPath!, "run-count.txt"), "utf8"),
    ).toBe("x");
  });
});

describe("command tool isolation", () => {
  test("the real scaffold gateway exposes the command tool with persisted result validation", async () => {
    const root = await tempRoot();
    const created = await createProjectWorkspace({
      root: join(root, "workspace"),
    });
    const profileId = crypto.randomUUID();
    const challengeId = crypto.randomUUID();
    const specification: ProjectFrozenSpecification = {
      version: 1,
      challengeId,
      profileId,
      challengeNumber: 1,
      title: "URL shortener service",
      request: "Build a URL shortener with separate files.",
      scope: "feature",
      difficulty: "medium",
      problemStatement:
        "Build a URL shortener service with separate HTTP, storage, and test files.",
      expectedOutcome: "A runnable skeleton with unfinished core logic.",
      implementationBoundary: null,
      objectives: ["Create the project skeleton."],
      acceptanceCriteria: [
        "Creates a short link and stores its target.",
        "Redirects a known short link.",
      ],
      durationEstimate: { minMinutes: 45, maxMinutes: 75 },
      stack: {
        experienceLevel: "mid-level",
        languages: ["TypeScript"],
        stack: ["Bun"],
        currentFocus: "backend",
      },
      model: { selection: null, label: "provider default" },
      frozenAt: new Date().toISOString(),
    };
    await writeFrozenSpecification(created.layout, specification);

    const checkCommand = "bun -e \"console.log('verify')\"";
    const completedAt = new Date().toISOString();
    const result: ProjectCommandResult = {
      status: "succeeded",
      started: true,
      exitCode: 0,
      signal: null,
      output: "verify\n",
      outputBytes: 7,
      truncated: false,
      timedOut: false,
      cancelled: false,
      durationMs: 5,
      error: null,
    };
    const execution: ProjectCommand = {
      id: crypto.randomUUID(),
      purpose: "check",
      checkId: "verify",
      status: "succeeded",
      command: checkCommand,
      cwd: ".",
      install: false,
      network: false,
      timeoutMs: 30_000,
      authorization: "individual",
      result,
      createdAt: completedAt,
      decidedAt: completedAt,
      startedAt: completedAt,
      completedAt,
    };
    const todoExecution: ProjectCommand = {
      ...execution,
      id: crypto.randomUUID(),
      checkId: "todo",
      status: "failed",
      command: todoCommand,
      result: {
        ...result,
        status: "failed",
        exitCode: 1,
        output: "",
        outputBytes: 0,
      },
    };
    const requests: unknown[] = [];
    const { faux, resolved } = resolvedModel();
    faux.setResponses([
      fauxAssistantMessage(
        projectFiles.map((file, index) =>
          fauxToolCall(
            "create_project_file",
            { path: file.path, content: file.content },
            { id: `create-${index}` },
          ),
        ),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        [
          fauxToolCall("run_project_command", {
            purpose: "check",
            checkId: "verify",
            command: checkCommand,
            cwd: ".",
            install: false,
            network: false,
          }),
          fauxToolCall("run_project_command", {
            purpose: "check",
            checkId: "todo",
            command: todoCommand,
            cwd: ".",
            install: false,
            network: false,
          }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        [
          fauxToolCall("complete_project_scaffold", {
            ...report(checkCommand, "passed"),
            blockingProblems: [],
          }),
        ],
        { stopReason: "toolUse" },
      ),
    ]);
    const gateway = createPiGateway({
      async resolve() {
        return resolved;
      },
    });
    const scaffolded = await gateway.scaffoldProject!({
      profileId,
      challengeId,
      specification,
      layout: created.layout,
      previousAttempt: null,
      runProjectCommand: async (request) => {
        requests.push(request);
        const selected = request.checkId === "todo" ? todoExecution : execution;
        return {
          id: selected.id,
          purpose: request.purpose,
          checkId: request.checkId ?? null,
          status: selected.status === "failed" ? "failed" : "succeeded",
          authorization: "individual",
          command: request.command,
          cwd: request.cwd,
          install: request.install,
          network: request.network,
          timeoutMs: request.timeoutMs ?? 30_000,
          result: selected.result,
        };
      },
      commandResults: async () => [execution, todoExecution],
    });
    expect(requests).toHaveLength(2);
    expect(scaffolded.results[0]?.status).toBe("passed");
  });
});
