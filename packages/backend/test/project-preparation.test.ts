import { afterAll, describe, expect, test } from "bun:test";
import {
  readFile,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { createApp } from "@repo/backend/app";
import { createPiGateway } from "@repo/backend/modules/ai/agent/gateway";
import {
  createProjectTools,
  projectToolJournalContext,
  type ProjectToolActivity,
} from "@repo/backend/modules/ai/agent/tools/project";
import type {
  BuildModelInput,
  LearnerContext,
  ModelGateway,
  ProjectScaffoldModelInput,
} from "@repo/backend/modules/ai/model-gateway";
import type {
  Challenge,
  ChallengePreparation,
  GeneratedBuildContent,
} from "@repo/backend/modules/challenges/challenge.schema";
import { AppError } from "@repo/backend/shared/errors/app-error";
import type {
  ProjectFrozenSpecification,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import {
  createProjectWorkspace,
  projectLayout,
  projectFileRecord,
  withGeneratedFile,
  writeProjectJournal,
} from "@repo/backend/modules/challenges/project-workspace";
import {
  frozenProjectSpecification,
  matchesFrozenSpecification,
  projectChallengeMarkdown,
  writeFrozenSpecification,
} from "@repo/backend/modules/challenges/project-preparation.spec";
import { resolvedModel } from "./fixtures/agent-fixtures";
import {
  harnessService,
  setHarnessPermissionModeProvider,
} from "@repo/backend/modules/harness/harness.service";
import { createAskUserTool } from "@repo/backend/modules/ai/agent/tools/ask-user";
import { projectScaffoldTask } from "@repo/backend/modules/ai/agent/tasks/project";
import { generationPrompt } from "@repo/backend/modules/ai/prompts/index";
import { projectScaffoldInstructions } from "@repo/backend/modules/ai/prompts/scaffold-project";

const roots: string[] = [];
setHarnessPermissionModeProvider(() => "auto-accept-edits");
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "grill-project-preparation-"));
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

function successfulScaffold(): {
  files: {
    path: string;
    role: ProjectScaffoldReport["files"][number]["role"];
    content: string;
  }[];
  report: ProjectScaffoldReport;
} {
  const files = [
    {
      path: "package.json",
      role: "config" as const,
      content: JSON.stringify(
        {
          name: "url-shortener",
          private: true,
          scripts: {
            test: "bun test",
            typecheck: "bun -e \"console.log('typecheck')\"",
            dev: "bun run src/app.ts",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "src/shortener.ts",
      role: "source" as const,
      content:
        'export interface ShortLink { slug: string; target: string }\n// TODO: implement the deterministic slug and storage boundary.\nexport function createShortLink(_target: string): ShortLink {\n  throw new Error("TODO: create short links");\n}\n',
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
      path: "fixtures/links.json",
      role: "fixture" as const,
      content: "[]\n",
    },
    {
      path: "test/shortener.test.ts",
      role: "test" as const,
      content:
        'import { test } from "bun:test";\n\ntest("creates an unfinished short link", () => {\n  throw new Error("TODO exercise remains unfinished");\n});\n',
    },
    {
      path: "test/wiring.test.ts",
      role: "test" as const,
      content:
        'import { expect, test } from "bun:test";\n\ntest("keeps the supporting wiring importable", () => {\n  expect(true).toBe(true);\n});\n',
    },
    {
      path: "README.md",
      role: "documentation" as const,
      content:
        "# URL shortener\n\nRun the project after implementing the TODO stub.\n",
    },
    {
      path: "RUBRIC.md",
      role: "documentation" as const,
      content:
        "# Rubric\n\n1. Short-link creation stores the target.\n2. Redirect resolves a known link.\n",
    },
    {
      path: "MILESTONES.md",
      role: "documentation" as const,
      content:
        "# Milestones\n\n1. Implement slug generation.\n2. Wire storage and redirects.\n",
    },
  ];
  return {
    files,
    report: {
      summary:
        "Created separate URL-shortener source, configuration, migration, fixture, documentation, rubric, milestone, and test files. Core short-link behavior remains TODO.",
      files: files.map((file) => ({
        path: file.path,
        role: file.role,
        purpose: null,
      })),
      todos: [
        {
          path: "src/shortener.ts",
          line: 2,
          note: "Implement slug generation and storage.",
        },
      ],
      setup: [
        {
          id: "setup",
          label: "Install dependencies",
          command: "bun install",
          cwd: ".",
          install: true,
          network: true,
        },
      ],
      run: [
        {
          id: "dev",
          label: "Run the service",
          command: "bun run dev",
          cwd: ".",
          install: false,
          network: false,
        },
      ],
      checks: [
        {
          id: "typecheck",
          label: "Typecheck the scaffold",
          kind: "typecheck",
          command: "bun run typecheck",
          cwd: ".",
          install: false,
          network: false,
          intent: "verify",
          expected: "pass",
        },
        {
          id: "verify-tests",
          label: "Run completed behavior tests",
          kind: "test",
          command: "bun test test/wiring.test.ts",
          cwd: ".",
          install: false,
          network: false,
          intent: "verify",
          expected: "pass",
        },
        {
          id: "todo-tests",
          label: "Run the intentionally failing TODO exercise",
          kind: "test",
          command: "bun test test/shortener.test.ts",
          cwd: ".",
          install: false,
          network: false,
          intent: "todo_exercise",
          expected: "fail",
        },
      ],
      results: [
        { checkId: "typecheck", status: "not_run", detail: null },
        { checkId: "verify-tests", status: "not_run", detail: null },
        { checkId: "todo-tests", status: "not_run", detail: null },
      ],
      problems: [],
      blockingProblems: [],
    },
  };
}

function commandCheckStatus(result: {
  status: string;
  result: { status: string } | null;
}) {
  if (
    result.result?.status === "timed_out" ||
    result.result?.status === "cancelled" ||
    result.result?.status === "spawn_failed"
  )
    return "blocked" as const;
  if (result.status === "succeeded") return "passed" as const;
  if (result.status === "failed") return "failed" as const;
  return "blocked" as const;
}

class FakeScaffoldModel implements ModelGateway {
  scaffoldInputs: ProjectScaffoldModelInput[] = [];
  activities: ProjectToolActivity[] = [];
  aborted = false;
  partialWritten = false;
  behavior: "success" | "fail" | "fraud" | "slow" = "success";
  reportOverride: Partial<ProjectScaffoldReport> = {};

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

  private async executeReport(
    input: ProjectScaffoldModelInput,
    report: ProjectScaffoldReport,
  ) {
    const run = input.runProjectCommand;
    if (!run) throw new Error("Authorized command tool was not supplied.");
    for (const setup of report.setup) {
      const result = await run(
        {
          purpose: "setup",
          command: setup.command,
          cwd: setup.cwd,
          install: setup.install,
          network: setup.network,
        },
        { preauthorized: true },
      );
      if (result.status !== "succeeded")
        throw new Error(`Setup command did not succeed: ${result.status}`);
    }
    const results: ProjectScaffoldReport["results"] = [];
    for (const check of report.checks) {
      if (!check.command) continue;
      const result = await run(
        {
          purpose: "check",
          checkId: check.id,
          command: check.command,
          cwd: check.cwd,
          install: check.install,
          network: check.network,
        },
        { preauthorized: true },
      );
      results.push({
        checkId: check.id,
        status: commandCheckStatus(result),
        detail: null,
      });
    }
    return { ...report, results };
  }

  private async writeFiles(input: ProjectScaffoldModelInput) {
    const create = createProjectTools({
      root: input.layout.projectRoot,
      journal: projectToolJournalContext(input.layout),
      signal: input.signal,
      onActivity: (activity) => {
        this.activities.push(activity);
        return input.onActivity?.(activity);
      },
    }).find((tool) => tool.name === "write")!;
    for (const file of successfulScaffold().files)
      await create.execute(
        "call",
        { path: file.path, content: file.content },
        undefined,
      );
  }

  async scaffoldProject(
    input: ProjectScaffoldModelInput,
  ): Promise<ProjectScaffoldReport> {
    this.scaffoldInputs.push(input);
    if (this.behavior === "success") {
      await this.writeFiles(input);
      return this.executeReport(input, {
        ...successfulScaffold().report,
        ...this.reportOverride,
      });
    }
    if (this.behavior === "fraud")
      return {
        ...successfulScaffold().report,
        files: [
          { path: "src/missing-a.ts", role: "source", purpose: null },
          { path: "src/missing-b.ts", role: "source", purpose: null },
        ],
        todos: [],
        checks: [
          {
            id: "only",
            label: "Only check",
            kind: "test",
            command: "bun test",
            cwd: ".",
            install: false,
            network: false,
            intent: "verify",
            expected: "pass",
          },
        ],
        results: [{ checkId: "only", status: "not_run", detail: null }],
      };
    const create = createProjectTools({
      root: input.layout.projectRoot,
      journal: projectToolJournalContext(input.layout),
      signal: input.signal,
      onActivity: input.onActivity,
    }).find((tool) => tool.name === "write")!;
    await create.execute(
      "call",
      { path: "src/partial.ts", content: "// partial\n" },
      undefined,
    );
    this.partialWritten = true;
    if (this.behavior === "fail")
      throw new AppError(
        "PROVIDER_TIMEOUT",
        "The model did not respond before the operation timeout.",
        503,
        true,
      );
    await new Promise<never>((_, reject) => {
      const abort = () => {
        this.aborted = true;
        reject(
          new AppError(
            "REQUEST_CANCELLED",
            "Project preparation was cancelled.",
            499,
          ),
        );
      };
      if (input.signal?.aborted) abort();
      else input.signal?.addEventListener("abort", abort, { once: true });
    });
    throw new Error("Unreachable slow scaffold state");
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

async function createChallenge(
  app: TestApp,
  profileId: string,
  prompt = "Build a URL shortener with separate HTTP, storage, migration, and test files",
) {
  const response = await request(app, "/challenges/generate", profileId, {
    prompt,
    scope: "feature",
    difficulty: "medium",
    clarificationContext: null,
  });
  expect(response.status).toBe(201);
  return (await json<{ data: Challenge }>(response)).data;
}

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
  return (
    await json<{
      data: {
        id: string | null;
        attempt: number | null;
        status: string;
        projectPath: string | null;
        specification: ProjectFrozenSpecification | null;
        report: ProjectScaffoldReport | null;
        error: { code: string; message: string } | null;
        activity: { type: string; path?: string }[];
        requestedModel: string | null;
      };
    }>(response)
  ).data;
}

async function waitForStatus(
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
    `Project preparation did not reach ${expected.join("/")}; last status ${last.status}: ${JSON.stringify(last.error)}`,
  );
}

function appWith(model: FakeScaffoldModel, root: string) {
  return createApp({
    llm: model,
    workspaceRoot: () => join(root, "workspaces"),
  });
}

describe("challenge project preparation", () => {
  test.each([
    {
      name: "expected exercise failures and informational caveats",
      problems: [
        "The exercise core is intentionally TODO and its tests fail as expected.",
        "The proposed long-running development server was not started.",
      ],
      blockingProblems: [],
      status: "ready",
    },
    {
      name: "a real scaffold blocker",
      problems: ["The exercise is intentionally TODO."],
      blockingProblems: ["Required supporting wiring is incomplete."],
      status: "failed",
    },
    {
      name: "a legacy report with unresolved problems",
      problems: ["Required supporting wiring is incomplete."],
      blockingProblems: undefined,
      status: "failed",
    },
  ])("handles $name", async ({ problems, blockingProblems, status }) => {
    const root = await tempRoot();
    const model = new FakeScaffoldModel();
    model.reportOverride = {
      problems: [...problems],
      blockingProblems: blockingProblems ? [...blockingProblems] : undefined,
    };
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `project-readiness-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const result = await waitForStatus(app, owner.id, challenge.id, [
      "ready",
      "failed",
    ]);
    expect(result.status).toBe(status);
    expect(result.report?.problems).toEqual([
      ...new Set([...(blockingProblems ?? []), ...problems]),
    ]);
    expect(
      result.report?.results.find((check) => check.checkId === "todo-tests")
        ?.status,
    ).toBe("failed");
    if (status === "failed") {
      expect(result.error?.code).toBe("PROJECT_SCAFFOLD_INCOMPLETE");
      expect(result.error).toMatchObject({
        details: { problems: [...(blockingProblems ?? problems)] },
      });
    } else expect(result.error).toBeNull();
  });

  test.each([
    ["I will set up the project myself.", "I will set up the project myself."],
    ["Use a full starter with Drizzle.", undefined],
  ])(
    "saves from-scratch preparation with model starting point %s",
    async (startingPoint, expected) => {
      const model = new (class extends FakeScaffoldModel {
        override async generateBuild(input: BuildModelInput) {
          const generated = await super.generateBuild(input);
          generated.challenge.problemStatement =
            "Build a URL shortener from scratch, including project setup.";
          generated.challenge.expectedOutcome =
            "Your own working URL shortener.";
          return {
            ...generated,
            challenge: { ...generated.challenge, startingPoint },
          };
        }
        override async scaffoldProject(input: ProjectScaffoldModelInput) {
          expect(input.specification.request).toContain("from scratch");
          expect(input.specification.startingPoint).toBe(expected);
          expect(projectScaffoldTask(input).context).toContain(
            expected ?? "Not specified.",
          );
          return {
            summary: "Project setup is part of the exercise. No checks ran.",
            files: [],
            todos: [],
            setup: [],
            run: [],
            checks: [],
            results: [],
            problems: [],
            blockingProblems: [],
          };
        }
      })();
      const app = appWith(model, await tempRoot());
      const owner = await startProfile(
        app,
        `project-from-scratch-${crypto.randomUUID()}@test.dev`,
      );
      const challenge = await createChallenge(
        app,
        owner.id,
        "Build a URL shortener from scratch. I will set up the project myself.",
      );
      const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
      expect(await readdir(ready.projectPath!)).toEqual(["CHALLENGE.md"]);
      expect(ready.report?.files).toEqual([]);
      expect(ready.report?.results).toEqual([]);
      expect(ready.specification?.startingPoint).toBe(expected);
    },
  );

  test.each(["answer", "cancel"])(
    "handles %s while a preparation question is pending",
    async (action) => {
      const model = new (class extends FakeScaffoldModel {
        override async scaffoldProject(input: ProjectScaffoldModelInput) {
          if (!input.requestUserInput)
            throw new Error("No clarification transport");
          const ask = createAskUserTool(input.requestUserInput);
          const result = await ask.execute(
            "question",
            {
              question: "What name should the sample room use?",
            },
            input.signal,
          );
          expect(result.details).toEqual({ answer: "Oak" });
          return {
            summary: "Clarified the sample room. No project files needed.",
            files: [],
            todos: [],
            setup: [],
            run: [],
            checks: [],
            results: [],
            problems: [],
            blockingProblems: [],
          };
        }
      })();
      const app = appWith(model, await tempRoot());
      const owner = await startProfile(
        app,
        `question-${crypto.randomUUID()}@test.dev`,
      );
      const other = await startProfile(
        app,
        `other-${crypto.randomUUID()}@test.dev`,
      );
      const challenge = await createChallenge(app, owner.id);
      async function pendingQuestion() {
        const thread = await harnessService.findThread({
          profileId: owner.id,
          challengeId: challenge.id,
          kind: "project_scaffold",
        });
        if (!thread) return null;
        const detail = await harnessService.detail(thread.id, owner.id);
        const question = detail.turns
          .flatMap((turn) => turn.items)
          .find(
            (item) =>
              item.type === "user_input_request" && item.status === "pending",
          );
        return question && detail.thread.status === "waiting"
          ? `/harness/${thread.id}/requests/${question.payload.requestId}`
          : null;
      }
      let path = await pendingQuestion();
      const deadline = Date.now() + 3000;
      while (!path && Date.now() < deadline) {
        await Bun.sleep(20);
        path = await pendingQuestion();
      }
      expect(path).toBeTruthy();
      const answer = { decision: "allow", answer: "Oak" };
      expect((await request(app, path!, other.id, answer)).status).toBe(404);
      if (action === "cancel") {
        const cancelled = await request(
          app,
          `/challenges/${challenge.id}/project-preparation/cancel`,
          owner.id,
          {},
        );
        expect(cancelled.ok).toBe(true);
        await waitForStatus(app, owner.id, challenge.id, ["cancelled"]);
        const late = await request(app, path!, owner.id, answer);
        const body = await json<{
          data: { status: string; payload: { answer?: string } };
        }>(late);
        expect(body.data.status).toBe("cancelled");
        expect(body.data.payload.answer).toBeUndefined();
        return;
      }
      expect((await request(app, path!, owner.id, answer)).status).toBe(200);
      const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
      expect(ready.report?.files).toEqual([]);
    },
  );

  test("automatically freezes the specification and scaffolds a multi-file URL shortener", async () => {
    const root = await tempRoot();
    const model = new FakeScaffoldModel();
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `project-owner-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);

    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
    expect(ready.attempt).toBe(1);
    expect(ready.projectPath).toEndWith("/project");
    expect(
      ready.report?.checks.some((check) => check.intent === "todo_exercise"),
    ).toBe(true);
    expect(
      ready.report?.results.map((result) => [result.checkId, result.status]),
    ).toEqual([
      ["typecheck", "passed"],
      ["verify-tests", "passed"],
      ["todo-tests", "failed"],
    ]);
    const projectPath = ready.projectPath!;
    for (const file of successfulScaffold().files)
      expect((await stat(join(projectPath, file.path))).isFile()).toBe(true);
    expect(await readFile(join(projectPath, "CHALLENGE.md"), "utf8")).toContain(
      "URL shortener service",
    );
    expect(
      await readFile(join(projectPath, "src", "shortener.ts"), "utf8"),
    ).toContain("// TODO: implement");
    expect(
      await readFile(join(projectPath, "test", "shortener.test.ts"), "utf8"),
    ).toContain("TODO exercise");
    expect(ready.specification?.acceptanceCriteria).toEqual(
      generatedBuild.completionCriteria,
    );
    expect(ready.specification?.model.label).toBe("provider default");

    // Reads only return durable state and never launch another model run.
    const before = model.scaffoldInputs.length;
    await preparation(app, owner.id, challenge.id);
    await preparation(app, owner.id, challenge.id);
    expect(model.scaffoldInputs.length).toBe(before);
    expect(model.scaffoldInputs[0]?.previousAttempt).toBeNull();
  });

  test("enforces ownership and does not start competing writers", async () => {
    const root = await tempRoot();
    const model = new FakeScaffoldModel();
    model.behavior = "slow";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `project-duplicate-${crypto.randomUUID()}@test.dev`,
    );
    const stranger = await startProfile(
      app,
      `project-stranger-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    await waitForStatus(app, owner.id, challenge.id, ["running"]);

    const denied = await request(
      app,
      `/challenges/${challenge.id}/project-preparation`,
      stranger.id,
    );
    expect(denied.status).toBe(404);
    const deniedStart = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/start`,
      stranger.id,
      {},
    );
    expect(deniedStart.status).toBe(404);

    const [first, second] = await Promise.all([
      request(
        app,
        `/challenges/${challenge.id}/project-preparation/start`,
        owner.id,
        {},
      ),
      request(
        app,
        `/challenges/${challenge.id}/project-preparation/start`,
        owner.id,
        {},
      ),
    ]);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const one = (await json<{ data: { attempt: number } }>(first)).data;
    const two = (await json<{ data: { attempt: number } }>(second)).data;
    expect(one.attempt).toBe(1);
    expect(two.attempt).toBe(1);
    expect(model.scaffoldInputs).toHaveLength(1);

    const partial = join(
      model.scaffoldInputs[0]!.layout.projectRoot,
      "src",
      "partial.ts",
    );
    for (let attempt = 0; attempt < 200 && !model.partialWritten; attempt++)
      await Bun.sleep(10);
    expect(model.partialWritten).toBe(true);
    expect((await stat(partial)).isFile()).toBe(true);
    const cancelledResponse = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/cancel`,
      owner.id,
      {},
    );
    expect(cancelledResponse.status).toBe(200);
    expect(
      (await json<{ data: { status: string } }>(cancelledResponse)).data.status,
    ).toBe("cancelled");
    await Bun.sleep(100);
    expect(model.aborted).toBe(true);
    expect((await stat(partial)).isFile()).toBe(true);
    expect(
      (await request(app, `/challenges/${challenge.id}`, owner.id)).status,
    ).toBe(200);
  });

  test("fences a run at shutdown and preserves its partial files", async () => {
    const root = await tempRoot();
    const model = new FakeScaffoldModel();
    model.behavior = "slow";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `project-shutdown-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    await waitForStatus(app, owner.id, challenge.id, ["running"]);
    for (let attempt = 0; attempt < 200 && !model.partialWritten; attempt++)
      await Bun.sleep(10);
    expect(model.partialWritten).toBe(true);
    const partial = join(
      model.scaffoldInputs[0]!.layout.projectRoot,
      "src",
      "partial.ts",
    );

    await app.projectPreparations.stop();
    const interrupted = await waitForStatus(app, owner.id, challenge.id, [
      "interrupted",
    ]);
    expect(interrupted.error?.code).toBe("PROJECT_PREPARATION_INTERRUPTED");
    expect((await stat(partial)).isFile()).toBe(true);
    expect(
      (await request(app, `/challenges/${challenge.id}`, owner.id)).status,
    ).toBe(200);

    model.behavior = "success";
    const started = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/start`,
      owner.id,
      {},
    );
    expect(started.status).toBe(202);
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
    expect(ready.attempt).toBe(2);
    expect(model.scaffoldInputs[1]?.previousAttempt).toMatchObject({
      attempt: 1,
      status: "interrupted",
    });
    expect((await stat(partial)).isFile()).toBe(true);
  });

  test("keeps the challenge and partial files when scaffolding fails", async () => {
    const root = await tempRoot();
    const model = new FakeScaffoldModel();
    model.behavior = "fail";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `project-failure-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const failed = await waitForStatus(app, owner.id, challenge.id, ["failed"]);
    expect(failed.error?.code).toBe("PROVIDER_TIMEOUT");
    expect(failed.report).toBeNull();
    const partial = join(failed.projectPath!, "src", "partial.ts");
    expect((await stat(partial)).isFile()).toBe(true);
    expect(
      (await request(app, `/challenges/${challenge.id}`, owner.id)).status,
    ).toBe(200);

    model.behavior = "success";
    const retried = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/start`,
      owner.id,
      {},
    );
    expect(retried.status).toBe(202);
    expect(
      (await json<{ data: { attempt: number } }>(retried)).data.attempt,
    ).toBe(2);
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
    expect(ready.attempt).toBe(2);
    expect(ready.projectPath).toEndWith("/project-2");
    expect((await stat(partial)).isFile()).toBe(true);
    expect(model.scaffoldInputs[1]?.previousAttempt).toMatchObject({
      attempt: 1,
      status: "failed",
    });
  });

  test("rejects a completion report whose files were not generated", async () => {
    const root = await tempRoot();
    const model = new FakeScaffoldModel();
    model.behavior = "fraud";
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `project-fraud-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const failed = await waitForStatus(app, owner.id, challenge.id, ["failed"]);
    expect(failed.status).toBe("failed");
    expect(failed.error?.code).toBe("PROJECT_SCAFFOLD_INVALID");
    expect(failed.error?.message).toContain("did not generate");
    expect(
      (await request(app, `/challenges/${challenge.id}`, owner.id)).status,
    ).toBe(200);
  });
});

describe("exercise-specific preparation reports", () => {
  test.each([
    {
      name: "from scratch",
      request: "Start from scratch. I will create the project and its files.",
      source: null,
      variant: "current",
    },
    {
      name: "setup as the exercise without an explicit starting point",
      request:
        "The exercise is to set up a TypeScript library workspace yourself: create the manifest, layout, and tooling decisions from scratch. Nothing is provided.",
      source: null,
      variant: "current",
    },
    {
      name: "implementation with a single starter file",
      request:
        "Provide only a starter file for the booking service. Leave SQLite persistence to me.",
      source: "export type Booking = { active: boolean };",
      variant: "current",
    },
    {
      name: "debugging without TODOs, using an older frozen brief",
      request:
        "Provide a booking service where cancelled bookings still block the room.",
      source:
        "export const isBlocked = (bookings: unknown[]) => bookings.length > 0;",
      variant: "legacy",
    },
    {
      name: "debugging without TODOs, using a brief frozen before the slimmed layout",
      request:
        "Provide a booking service where cancelled bookings still block the room.",
      source:
        "export const isBlocked = (bookings: unknown[]) => bookings.length > 0;",
      variant: "previous",
    },
  ])("accepts $name", async (exercise) => {
    const root = await tempRoot();
    const { layout, journal } = await createProjectWorkspace({ root });
    const specification: ProjectFrozenSpecification = {
      version: 1,
      challengeId: crypto.randomUUID(),
      profileId: crypto.randomUUID(),
      challengeNumber: 40,
      title: "Booking service",
      request: exercise.request,
      scope: "feature",
      difficulty: "medium",
      problemStatement: exercise.request,
      expectedOutcome: "A booking service that meets the challenge criteria.",
      implementationBoundary: "No generated tests.",
      objectives: [
        "A booking service that meets the challenge criteria.",
        "Practice booking service behavior.",
      ],
      acceptanceCriteria: ["Only active bookings prevent conflicts."],
      durationEstimate: { minMinutes: 30, maxMinutes: 60 },
      stack: {
        experienceLevel: "Intermediate",
        languages: ["TypeScript", "SQL"],
        stack: ["Bun", "PostgreSQL", "SQLite", "Prisma", "Drizzle ORM"],
        currentFocus: null,
      },
      model: { selection: null, label: "fake" },
      frozenAt: new Date().toISOString(),
    };
    const brief = join(layout.projectRoot, "CHALLENGE.md");
    if (exercise.variant !== "current") {
      const frozenMarkdown = projectChallengeMarkdown(
        specification,
        exercise.variant,
      );
      await writeFile(brief, frozenMarkdown);
      await writeProjectJournal(
        layout,
        withGeneratedFile(
          journal,
          "CHALLENGE.md",
          projectFileRecord(frozenMarkdown),
        ),
      );
    }
    await writeFrozenSpecification(layout, specification);

    const task = projectScaffoldTask({
      profileId: specification.profileId,
      challengeId: specification.challengeId,
      specification,
      layout,
      previousAttempt: null,
      commandResults: async () => [],
    });
    expect(task.userText).toBe(specification.request);
    expect(task.context).toContain("No generated tests.");
    expect(task.context).toContain("Only active bookings prevent conflicts.");
    expect(task.context).toContain("Practice booking service behavior.");
    expect(task.context).toContain("Intermediate");
    expect(
      task.context.match(
        /A booking service that meets the challenge criteria/g,
      ),
    ).toHaveLength(1);
    expect(task.context).not.toContain(specification.challengeId);
    expect(task.context).not.toContain(specification.profileId);
    expect(task.context).not.toContain(specification.frozenAt);
    expect(task.context).not.toContain(layout.projectRoot);
    expect(task.context).not.toMatch(
      /PostgreSQL|Drizzle ORM|Requested Model|Challenge Number|Guidance/,
    );
    const files = [];
    if (exercise.source) {
      const create = createProjectTools({
        root: layout.projectRoot,
        journal: projectToolJournalContext(layout),
      }).find((tool) => tool.name === "write")!;
      await create.execute(
        "create",
        { path: "starter.ts", content: exercise.source },
        undefined,
      );
      files.push({ path: "starter.ts", role: "source", purpose: null });
    }
    const report = {
      summary: exercise.source
        ? "Prepared the starting file."
        : "Setup is part of the exercise.",
      files,
      todos: [],
      setup: [],
      run: [],
      checks: [],
      results: [],
      problems: [],
      blockingProblems: [],
    };
    expect(await task.completion.validate(report)).toEqual(report);
    expect((await readdir(layout.projectRoot)).sort()).toEqual(
      exercise.source ? ["CHALLENGE.md", "starter.ts"] : ["CHALLENGE.md"],
    );
    const frozen = await readFile(brief, "utf8");
    expect(frozen).toBe(
      projectChallengeMarkdown(specification, exercise.variant),
    );
    // The visible brief carries the challenge contract, not the profile's
    // technology dump; only layouts frozen before the slimmed brief include it.
    if (exercise.variant === "current") {
      expect(frozen).not.toContain("PostgreSQL");
      expect(frozen).not.toContain("Not every project uses JavaScript");
    } else {
      expect(frozen).toContain("PostgreSQL");
    }

    if (exercise.source) {
      const starter = join(layout.projectRoot, "starter.ts");
      await writeFile(starter, "// engineer's changes");
      await expect(task.completion.validate(report)).rejects.toThrow(
        "no longer matches the generated-file journal",
      );
      expect(await readFile(starter, "utf8")).toBe("// engineer's changes");
    }
  });

  test("the current brief is the challenge contract and stays compatible with older layouts", () => {
    const specification: ProjectFrozenSpecification = {
      version: 1,
      challengeId: crypto.randomUUID(),
      profileId: crypto.randomUUID(),
      challengeNumber: 51,
      title: "Offline agent loop",
      request: "Practice pi-agent-core offline with a fake model.",
      scope: "focused",
      difficulty: "medium",
      problemStatement: "Build an offline agent loop with a scripted model.",
      expectedOutcome: "A small offline project with a scripted fake model.",
      implementationBoundary: "No real AI provider calls.",
      objectives: ["A small offline project with a scripted fake model."],
      acceptanceCriteria: ["The scripted run finishes offline."],
      durationEstimate: { minMinutes: 45, maxMinutes: 90 },
      stack: {
        experienceLevel: "Intermediate",
        languages: ["TypeScript"],
        stack: ["Bun", "PostgreSQL", "SQLite", "Drizzle ORM"],
        currentFocus: null,
      },
      model: { selection: null, label: "fake" },
      frozenAt: new Date().toISOString(),
    };

    const current = projectChallengeMarkdown(specification);
    expect(current).toContain("## Implementation boundary");
    expect(current).toContain("No real AI provider calls.");
    // The outcome is already the only objective, so its section is not repeated.
    expect(current).not.toContain("## Objectives");
    // No profile technology dump and no agent-facing instructions.
    expect(current).not.toContain("PostgreSQL");
    expect(current).not.toContain("Not every project uses JavaScript");
    expect(current).not.toContain("Follow the original request and task");
    expect(matchesFrozenSpecification(current, specification)).toBe(true);

    // Briefs frozen before the slimmed layout stay readable and valid.
    const previous = projectChallengeMarkdown(specification, "previous");
    expect(previous).toContain("PostgreSQL");
    expect(previous).toContain("## Objectives");
    expect(previous).toContain("Not every project uses JavaScript");
    expect(matchesFrozenSpecification(previous, specification)).toBe(true);
    expect(
      matchesFrozenSpecification(
        projectChallengeMarkdown(specification, "legacy"),
        specification,
      ),
    ).toBe(true);
    // The layouts are actually distinct, so old files are not misread as new.
    expect(current).not.toBe(previous);
  });
});

describe("starting-point preparation semantics", () => {
  // Grounded in the request that left challenge #50 empty: it grants the
  // engineer layout and tooling freedom and adds run-environment constraints,
  // but never asks for a from-scratch start.
  const piAgentCoreRequest = [
    "I just learned to build agents with pi-agent-core.",
    "Give me a TypeScript library exercise: a small retry-and-logging utility for agent tool calls.",
    "I want to choose my own file layout and test tooling.",
    "No API keys: use a fake model.",
    "It must run offline.",
  ].join(" ");

  const piAgentCoreBuild: GeneratedBuildContent = {
    title: "Agent tool retry utility",
    estimatedDifficultyBand: "medium",
    difficultyReason: "Direct application of retry and logging patterns.",
    topic: "TypeScript",
    implementationBoundary:
      "A TypeScript library. Choose your own file layout and test tooling. No API keys: use a fake model. It must run offline.",
    durationEstimate: { minMinutes: 30, maxMinutes: 60 },
    implementationMilestones: [],
    problemStatement:
      "Build a retry-and-logging utility for agent tool calls. Choose your own file layout and test tooling. No API keys: use a fake model. It must run offline.",
    expectedOutcome: "A small TypeScript library you designed and implemented.",
    completionCriteria: [
      "Retries a failing tool call with a bounded attempt count.",
      "Logs each attempt without calling a real model API.",
      "Runs offline with a fake model and no API keys.",
    ],
  };

  const manifest = JSON.stringify(
    {
      name: "agent-tool-retry",
      private: true,
      dependencies: { "@earendil-works/pi-agent-core": "1.5.2" },
    },
    null,
    2,
  );

  const manifestCheck = {
    id: "manifest",
    label: "Parse the package manifest",
    kind: "typecheck" as const,
    command:
      "bun -e \"JSON.parse(require('fs').readFileSync('package.json','utf8'))\"",
    cwd: ".",
    install: false,
    network: false,
    intent: "verify" as const,
    expected: "pass" as const,
  };

  async function createFile(
    input: ProjectScaffoldModelInput,
    path: string,
    content: string,
  ) {
    const create = createProjectTools({
      root: input.layout.projectRoot,
      journal: projectToolJournalContext(input.layout),
      signal: input.signal,
      onActivity: input.onActivity,
    }).find((tool) => tool.name === "write")!;
    await create.execute("call", { path, content }, undefined);
  }

  /** Prepares only a minimal starting environment for the library exercise. */
  function minimalEnvironmentReport(
    summary: string,
    results: ProjectScaffoldReport["results"],
  ): ProjectScaffoldReport {
    return {
      summary,
      files: [
        { path: "package.json", role: "config", purpose: "Minimal manifest." },
      ],
      todos: [],
      setup: [],
      run: [],
      checks: [manifestCheck],
      results,
      problems: [],
      blockingProblems: [],
    };
  }

  async function preparationState(
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
    return (
      await json<{
        data: {
          status: string;
          projectPath: string | null;
          commands: {
            id: string;
            status: string;
            command: string;
            install: boolean;
            network: boolean;
            result: { status: string } | null;
          }[];
          specification: ProjectFrozenSpecification | null;
          report: ProjectScaffoldReport | null;
          error: { code: string; message: string } | null;
        };
      }>(response)
    ).data;
  }

  async function waitForPreparationState(
    app: TestApp,
    profileId: string,
    challengeId: string,
    expected: string[],
  ) {
    const end = Date.now() + 8_000;
    let last = await preparationState(app, profileId, challengeId);
    while (Date.now() < end) {
      if (expected.includes(last.status)) return last;
      await Bun.sleep(20);
      last = await preparationState(app, profileId, challengeId);
    }
    throw new Error(
      `Preparation did not reach ${expected.join("/")}; last ${last.status}: ${JSON.stringify(last.error)}`,
    );
  }

  async function rejectCommand(
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

  test("generation keeps run-environment constraints out of the starting point", () => {
    const instructions = generationPrompt({
      prompt: piAgentCoreRequest,
      scope: "feature",
      difficulty: "medium",
      clarificationContext: null,
      learner: {
        profileId: crypto.randomUUID(),
        preferences: {
          profileId: crypto.randomUUID(),
          experienceLevel: "mid-level",
          languages: ["typescript"],
          stack: ["bun"],
          learningGoals: [],
          currentFocus: "backend",
          aboutMe: null,
          topicFamiliarity: [],
          knownConcepts: [],
          learningGoal: null,
          includeRecentChallenges: false,
          displayName: null,
          projects: [],
          updatedAt: new Date().toISOString(),
          developerContextUpdatedAt: null,
        } as never,
        recentChallenges: [],
      },
    });
    expect(instructions.instructions).toContain(
      "keep them in the brief and out of startingPoint",
    );
    // The old rule copied qualifiers and exclusions into startingPoint, which
    // is how tooling freedom reached the saved starting point of challenge #50.
    expect(instructions.instructions).not.toContain(
      "including qualifiers and exclusions",
    );
  });

  test("preparation instructions separate from-scratch, constraint, and offline cases", () => {
    const instructions = projectScaffoldInstructions();
    expect(instructions).toContain(
      "only when the engineer explicitly asked to build the project from scratch",
    );
    expect(instructions).toContain("not a from-scratch request");
    expect(instructions).toContain("never justify an empty folder");
    expect(instructions).toContain("makes project setup the exercise");
    expect(instructions).toContain("minimal useful environment");
    expect(instructions).toContain("exactly as you will report it");
    expect(instructions).toContain("never records a check result");
    expect(instructions).toContain(
      "Installing dependencies is a network command",
    );
    expect(instructions).toContain("never authorizes one");
    expect(instructions).toContain("report the skip honestly");
    expect(instructions).toContain("summary must state the reason");
  });

  test("an unspecified starting point prepares a minimal environment, not an empty folder", async () => {
    const model = new (class extends FakeScaffoldModel {
      override async generateBuild(input: BuildModelInput) {
        return {
          status: "ready" as const,
          challenge: {
            ...piAgentCoreBuild,
            estimatedDifficultyBand: input.difficulty,
          },
          question: null,
          options: [],
        };
      }
      override async scaffoldProject(input: ProjectScaffoldModelInput) {
        expect(input.specification.request).toBe(piAgentCoreRequest);
        expect(input.specification.startingPoint).toBeUndefined();
        expect(projectScaffoldTask(input).context).toContain("Not specified.");
        await createFile(input, "package.json", manifest);
        const run = input.runProjectCommand;
        if (!run) throw new Error("Command tool was not supplied.");
        const check = await run(
          {
            purpose: "check",
            checkId: manifestCheck.id,
            command: manifestCheck.command,
            cwd: manifestCheck.cwd,
            install: false,
            network: false,
          },
          { preauthorized: true },
        );
        expect(check.status).toBe("succeeded");
        return minimalEnvironmentReport(
          "Prepared a minimal starting environment: a package manifest with the declared dependency. No source layout was prescribed and no exercise work was implemented. The manifest parsed.",
          [{ checkId: manifestCheck.id, status: "passed", detail: null }],
        );
      }
    })();
    const app = appWith(model, await tempRoot());
    const owner = await startProfile(
      app,
      `starting-unspecified-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id, piAgentCoreRequest);
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);

    expect(ready.specification?.startingPoint).toBeUndefined();
    const brief = await readFile(
      join(ready.projectPath!, "CHALLENGE.md"),
      "utf8",
    );
    // Constraints stay preserved as requirements, without a starting-point
    // heading that preparation could mistake for an explicit choice.
    expect(brief).toContain("Choose your own file layout and test tooling");
    expect(brief).toContain("run offline");
    expect(brief).not.toContain("## Requested starting point");

    expect(ready.report?.files).toHaveLength(1);
    expect(ready.report?.summary).toContain("minimal starting environment");
    expect(ready.report?.summary).not.toContain("from scratch");
    const entries = await readdir(ready.projectPath!);
    expect(entries.sort()).toEqual(["CHALLENGE.md", "package.json"]);
    const written = await readFile(
      join(ready.projectPath!, "package.json"),
      "utf8",
    );
    expect(written).toBe(manifest);
    expect(written).not.toContain("TODO");
  });

  test("a saved tooling-freedom constraint is never treated as a from-scratch request", async () => {
    const echoed = "I want to choose my own file layout and test tooling.";
    const model = new (class extends FakeScaffoldModel {
      override async generateBuild(input: BuildModelInput) {
        const generated = await super.generateBuild(input);
        return {
          ...generated,
          challenge: { ...generated.challenge, startingPoint: echoed },
        };
      }
      override async scaffoldProject(input: ProjectScaffoldModelInput) {
        // The echo is a verbatim quote of the request, so the extraction guard
        // saves it; preparation must still not treat it as from scratch.
        expect(input.specification.startingPoint).toBe(echoed);
        await createFile(input, "package.json", manifest);
        const run = input.runProjectCommand;
        if (!run) throw new Error("Command tool was not supplied.");
        const check = await run(
          {
            purpose: "check",
            checkId: manifestCheck.id,
            command: manifestCheck.command,
            cwd: manifestCheck.cwd,
            install: false,
            network: false,
          },
          { preauthorized: true },
        );
        expect(check.status).toBe("succeeded");
        return minimalEnvironmentReport(
          "Prepared a minimal starting environment despite the saved tooling-freedom constraint: a package manifest with the declared dependency. The manifest parsed.",
          [{ checkId: manifestCheck.id, status: "passed", detail: null }],
        );
      }
    })();
    const app = appWith(model, await tempRoot());
    const owner = await startProfile(
      app,
      `starting-constraint-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id, piAgentCoreRequest);
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);

    expect(ready.specification?.startingPoint).toBe(echoed);
    const brief = await readFile(
      join(ready.projectPath!, "CHALLENGE.md"),
      "utf8",
    );
    expect(brief).toContain("## Requested starting point");
    const entries = await readdir(ready.projectPath!);
    expect(entries.sort()).toEqual(["CHALLENGE.md", "package.json"]);
    expect(ready.report?.summary).toContain("minimal starting environment");
  });

  test("an offline exercise never runs an unauthorized network command and reports the skipped install", async () => {
    const model = new (class extends FakeScaffoldModel {
      override async generateBuild(input: BuildModelInput) {
        return {
          status: "ready" as const,
          challenge: {
            ...piAgentCoreBuild,
            estimatedDifficultyBand: input.difficulty,
          },
          question: null,
          options: [],
        };
      }
      override async scaffoldProject(input: ProjectScaffoldModelInput) {
        expect(input.specification.startingPoint).toBeUndefined();
        await createFile(input, "package.json", manifest);
        const run = input.runProjectCommand;
        if (!run) throw new Error("Command tool was not supplied.");
        // Offline requirement: the install is proposed, not executed, and its
        // outcome is reported honestly after the engineer declines it.
        const install = await run({
          purpose: "setup",
          command: "bun install",
          cwd: ".",
          install: true,
          network: true,
        });
        expect(install.status).toBe("rejected");
        expect(install.result).toBeNull();
        const check = await run(
          {
            purpose: "check",
            checkId: manifestCheck.id,
            command: manifestCheck.command,
            cwd: manifestCheck.cwd,
            install: false,
            network: false,
          },
          { preauthorized: true },
        );
        expect(check.status).toBe("succeeded");
        return {
          summary:
            "Prepared a minimal starting environment: a package manifest with the declared dependency. The manifest parsed. Dependencies were not installed because the network command was not authorized; run the listed setup command before starting.",
          files: [
            { path: "package.json", role: "config" as const, purpose: null },
          ],
          todos: [],
          setup: [
            {
              id: "install",
              label: "Install dependencies",
              command: "bun install",
              cwd: ".",
              install: true,
              network: true,
            },
          ],
          run: [],
          checks: [manifestCheck],
          results: [
            {
              checkId: manifestCheck.id,
              status: "passed" as const,
              detail: null,
            },
          ],
          problems: [
            "Dependencies were not installed because the network command was not authorized for this attempt.",
          ],
          blockingProblems: [],
        } satisfies ProjectScaffoldReport;
      }
    })();
    const app = appWith(model, await tempRoot());
    const owner = await startProfile(
      app,
      `starting-offline-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id, piAgentCoreRequest);

    // The install request becomes a pending authorization, never a process.
    const end = Date.now() + 8_000;
    let pending: Awaited<ReturnType<typeof preparationState>> | null = null;
    while (Date.now() < end) {
      const state = await preparationState(app, owner.id, challenge.id);
      const command = state.commands.find(
        (entry) => entry.status === "pending" && entry.network,
      );
      if (command) {
        pending = state;
        expect(
          (await rejectCommand(app, owner.id, challenge.id, command.id)).status,
        ).toBe(200);
        break;
      }
      await Bun.sleep(20);
    }
    expect(pending).not.toBeNull();

    const ready = await waitForPreparationState(app, owner.id, challenge.id, [
      "ready",
    ]);
    expect(ready.report?.summary).toContain("were not installed");
    expect(ready.report?.problems).toContain(
      "Dependencies were not installed because the network command was not authorized for this attempt.",
    );
    const install = ready.commands.find(
      (entry) => entry.command === "bun install",
    );
    expect(install?.status).toBe("rejected");
    expect(install?.result).toBeNull();
    // No network or install command ever executed; only the offline check ran.
    for (const command of ready.commands)
      if (command.status === "succeeded") {
        expect(command.network).toBe(false);
        expect(command.install).toBe(false);
      }
    const entries = await readdir(ready.projectPath!);
    expect(entries.sort()).toEqual(["CHALLENGE.md", "package.json"]);
  });
});

describe("Pi project-scaffold gateway", () => {
  test("writes real files with project tools and skips diagnostic run logs", async () => {
    const root = await tempRoot();
    const created = await createProjectWorkspace({ root });
    const challenge = {
      id: crypto.randomUUID(),
      profileId: crypto.randomUUID(),
      number: 1,
      title: "URL shortener service",
      scope: "feature" as const,
      difficulty: "medium" as const,
      contextualDifficulty: "medium" as const,
      estimatedDifficultyScore: null,
      difficultyReason: "Bounded API reasoning.",
      topic: "TypeScript",
      implementationBoundary: "HTTP and storage boundary.",
      contextSnapshot: null,
      promptVersion: null,
      problemStatement:
        "Build a URL shortener service with separate HTTP, storage, migration, and test files.",
      expectedOutcome: "A runnable skeleton with unimplemented core logic.",
      completionCriteria: generatedBuild.completionCriteria,
      implementationMilestones: [],
      durationMinMinutes: 45,
      durationMaxMinutes: 75,
      hint: null,
      workspacePath: null,
      status: "active" as const,
      createdAt: new Date(),
      completedAt: null,
      archivedAt: null,
    };
    const specification = frozenProjectSpecification({
      challenge,
      request:
        "Build a URL shortener with separate HTTP, storage, migration, and test files",
      preferences: {
        profileId: challenge.profileId,
        experienceLevel: "mid-level",
        languages: ["typescript"],
        stack: ["bun"],
        learningGoals: [],
        currentFocus: "backend",
        aboutMe: null,
        topicFamiliarity: [],
        knownConcepts: [],
        learningGoal: null,
        includeRecentChallenges: false,
        displayName: null,
        projects: [],
        updatedAt: new Date().toISOString(),
        developerContextUpdatedAt: null,
      } as never,
      at: new Date(),
    });
    await writeFrozenSpecification(created.layout, specification);
    const fixture = successfulScaffold();
    const task = projectScaffoldTask({
      profileId: challenge.profileId,
      challengeId: challenge.id,
      specification,
      layout: created.layout,
      previousAttempt: null,
    });
    expect(task.completion.schema).toMatchObject({
      required: expect.arrayContaining(["blockingProblems"]),
    });
    const { blockingProblems: _blockers, ...legacyReport } = fixture.report;
    await expect(task.completion.validate(legacyReport)).rejects.toMatchObject({
      code: "PROJECT_SCAFFOLD_INVALID",
      message: expect.stringContaining("blockingProblems"),
    });
    const { faux, resolved } = resolvedModel();
    faux.setResponses([
      fauxAssistantMessage(
        fixture.files.map((file, index) =>
          fauxToolCall(
            "write",
            { path: file.path, content: file.content },
            { id: `call-${index}` },
          ),
        ),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        [
          fauxToolCall("complete_project_scaffold", fixture.report, {
            id: "complete",
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
    const activities: ProjectToolActivity[] = [];
    const report = await gateway.scaffoldProject!({
      profileId: challenge.profileId,
      challengeId: challenge.id,
      specification,
      layout: created.layout,
      previousAttempt: null,
      onActivity: (activity) => {
        activities.push(activity);
      },
    });
    expect(report.summary).toContain("URL-shortener");
    expect(
      (await stat(join(created.layout.projectRoot, "src", "app.ts"))).isFile(),
    ).toBe(true);
    expect(activities.map((activity) => activity.type)).toEqual(
      expect.arrayContaining(["created_file"]),
    );
    const layoutAgain = projectLayout(root, 1);
    expect(layoutAgain.projectDirectory).toBe("project");
  });
});
