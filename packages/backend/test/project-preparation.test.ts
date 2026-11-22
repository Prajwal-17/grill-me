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
  projectChallengeMarkdown,
  writeFrozenSpecification,
} from "@repo/backend/modules/challenges/project-preparation.spec";
import { resolvedModel } from "./fixtures/agent-fixtures";
import { setHarnessPermissionModeProvider } from "@repo/backend/modules/harness/harness.service";
import { projectScaffoldTask } from "@repo/backend/modules/ai/agent/tasks/project";

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
    }).find((tool) => tool.name === "create_project_file")!;
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
    }).find((tool) => tool.name === "create_project_file")!;
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

  test("saves preparation with just the brief for a from-scratch challenge", async () => {
    const model = new (class extends FakeScaffoldModel {
      override async generateBuild(input: BuildModelInput) {
        const generated = await super.generateBuild(input);
        generated.challenge.problemStatement =
          "Build a URL shortener from scratch, including project setup.";
        generated.challenge.expectedOutcome = "Your own working URL shortener.";
        return generated;
      }
      override async scaffoldProject(input: ProjectScaffoldModelInput) {
        expect(input.specification.request).toContain("from scratch");
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
  });

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
      legacy: false,
    },
    {
      name: "implementation with a single starter file",
      request:
        "Provide only a starter file for the booking service. Leave SQLite persistence to me.",
      source: "export type Booking = { active: boolean };",
      legacy: false,
    },
    {
      name: "debugging without TODOs, using an older frozen brief",
      request:
        "Provide a booking service where cancelled bookings still block the room.",
      source:
        "export const isBlocked = (bookings: unknown[]) => bookings.length > 0;",
      legacy: true,
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
      implementationBoundary: null,
      objectives: ["Practice booking service behavior."],
      acceptanceCriteria: ["Only active bookings prevent conflicts."],
      durationEstimate: { minMinutes: 30, maxMinutes: 60 },
      stack: {
        experienceLevel: null,
        languages: ["TypeScript", "SQL"],
        stack: ["Bun", "PostgreSQL", "SQLite", "Prisma", "Drizzle ORM"],
        currentFocus: null,
      },
      model: { selection: null, label: "fake" },
      frozenAt: new Date().toISOString(),
    };
    const brief = join(layout.projectRoot, "CHALLENGE.md");
    if (exercise.legacy) {
      const legacyMarkdown = projectChallengeMarkdown(specification, true);
      await writeFile(brief, legacyMarkdown);
      await writeProjectJournal(
        layout,
        withGeneratedFile(
          journal,
          "CHALLENGE.md",
          projectFileRecord(legacyMarkdown),
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
    const files = [];
    if (exercise.source) {
      const create = createProjectTools({
        root: layout.projectRoot,
        journal: projectToolJournalContext(layout),
      }).find((tool) => tool.name === "create_project_file")!;
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
    expect(await readFile(brief, "utf8")).toBe(
      projectChallengeMarkdown(specification, exercise.legacy),
    );

    if (exercise.source) {
      const starter = join(layout.projectRoot, "starter.ts");
      await writeFile(starter, "// engineer's changes");
      await expect(task.completion.validate(report)).rejects.toThrow(
        "no longer matches the generated-file journal",
      );
      expect(await readFile(starter, "utf8")).toBe("// engineer's changes");
    }
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
            "create_project_file",
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
