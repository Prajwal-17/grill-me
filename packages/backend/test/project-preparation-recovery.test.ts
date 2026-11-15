import { afterAll, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createApp } from "@repo/backend/app";
import {
  createProjectTools,
  projectToolJournalContext,
} from "@repo/backend/modules/ai/agent/tools/project";
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
import { projectPreparationModel } from "@repo/backend/modules/challenges/project-preparation.model";
import {
  projectMetadataDirectory,
  projectJournalDirectory,
} from "@repo/backend/modules/challenges/project-workspace";
import type {
  ProjectPreparation,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import {
  migrateDatabase,
  sqliteDatabase,
} from "@repo/backend/shared/database/db";

await migrateDatabase();
const { setHarnessPermissionModeProvider } =
  await import("@repo/backend/modules/harness/harness.service");
setHarnessPermissionModeProvider(() => "auto-accept-edits");

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "grill-project-recovery-"));
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
    content: JSON.stringify({ name: "url-shortener", private: true }, null, 2),
  },
  {
    path: "migrations/001_links.sql",
    role: "migration" as const,
    content:
      "CREATE TABLE links (slug TEXT PRIMARY KEY, target TEXT NOT NULL);\n",
  },
  {
    path: "src/main.ts",
    role: "source" as const,
    content:
      "// TODO: implement the short-link exercise.\nexport function createShortLink() {\n  throw new Error('TODO');\n}\n",
  },
  {
    path: "src/wiring.ts",
    role: "source" as const,
    content: "export const wiringReady = true;\n",
  },
  {
    path: "test/exercise.test.ts",
    role: "test" as const,
    content:
      "import { test } from 'bun:test';\n\ntest('unfinished exercise', () => {\n  throw new Error('TODO exercise');\n});\n",
  },
  {
    path: "README.md",
    role: "documentation" as const,
    content: "# URL shortener\n\nImplement the TODO exercise.\n",
  },
  {
    path: "RUBRIC.md",
    role: "documentation" as const,
    content: "# Rubric\n\n1. Short links are created.\n",
  },
  {
    path: "MILESTONES.md",
    role: "documentation" as const,
    content: "# Milestones\n\n1. Implement short-link creation.\n",
  },
];

type Handler = (
  input: ProjectScaffoldModelInput,
  call: number,
) => Promise<ProjectScaffoldReport>;

class FakeRecoveryModel implements ModelGateway {
  inputs: ProjectScaffoldModelInput[] = [];
  handler: Handler;

  constructor(handler: Handler) {
    this.handler = handler;
  }

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

  async scaffoldProject(input: ProjectScaffoldModelInput) {
    this.inputs.push(input);
    return this.handler(input, this.inputs.length - 1);
  }
}

function toolsFor(input: ProjectScaffoldModelInput) {
  return createProjectTools({
    root: input.layout.projectRoot,
    journal: projectToolJournalContext(input.layout),
    signal: input.signal,
    onActivity: input.onActivity,
  });
}

async function createFile(
  input: ProjectScaffoldModelInput,
  path: string,
  content: string,
) {
  const create = toolsFor(input).find(
    (tool) => tool.name === "create_project_file",
  )!;
  return create.execute("call", { path, content }, undefined);
}

async function writeProjectFiles(
  input: ProjectScaffoldModelInput,
  files: typeof projectFiles,
) {
  for (const file of files) await createFile(input, file.path, file.content);
}

function reportFor(
  files: { path: string; role: (typeof projectFiles)[number]["role"] }[],
  summary: string,
): ProjectScaffoldReport {
  return {
    summary,
    files: files.map((file) => ({
      path: file.path,
      role: file.role,
      purpose: null,
    })),
    todos: [
      {
        path: "src/main.ts",
        line: 1,
        note: "Implement the short-link exercise.",
      },
    ],
    setup: [],
    run: [],
    checks: [
      {
        id: "verify",
        label: "Verify the supporting wiring",
        kind: "test",
        command: "bun -e \"console.log('verify')\"",
        cwd: ".",
        install: false,
        network: false,
        intent: "verify",
        expected: "pass",
      },
      {
        id: "todo-exercise",
        label: "Run the intentionally failing TODO exercise",
        kind: "test",
        command: "bun test test/exercise.test.ts",
        cwd: ".",
        install: false,
        network: false,
        intent: "todo_exercise",
        expected: "fail",
      },
    ],
    results: [
      { checkId: "verify", status: "not_run", detail: null },
      { checkId: "todo-exercise", status: "not_run", detail: null },
    ],
    problems: [],
  };
}

function checkStatus(result: {
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

async function executeChecks(
  input: ProjectScaffoldModelInput,
  report: ProjectScaffoldReport,
) {
  const run = input.runProjectCommand;
  if (!run) throw new Error("Authorized command tool was not supplied.");
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
      status: checkStatus(result),
      detail: null,
    });
  }
  return { ...report, results };
}

async function writtenFiles(input: ProjectScaffoldModelInput) {
  const journal = JSON.parse(
    await readFile(input.layout.journalPath, "utf8"),
  ) as {
    files: Record<string, unknown>;
  };
  return projectFiles.filter((file) => journal.files[file.path]);
}

async function completeFromDisk(
  input: ProjectScaffoldModelInput,
  summary: string,
) {
  return executeChecks(input, reportFor(await writtenFiles(input), summary));
}

async function failAfterFiles(
  input: ProjectScaffoldModelInput,
): Promise<never> {
  await writeProjectFiles(input, projectFiles);
  throw new Error("The provider stopped after writing partial files.");
}

async function waitUntilAborted(
  input: ProjectScaffoldModelInput,
): Promise<never> {
  await new Promise<never>((_, reject) => {
    const abort = () =>
      reject(
        new Error(
          input.signal?.aborted ? "cancelled" : "unexpected resume signal",
        ),
      );
    if (input.signal?.aborted) abort();
    else input.signal?.addEventListener("abort", abort, { once: true });
  });
  throw new Error("Unreachable aborted scaffold state");
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
  return (await json<{ data: ProjectPreparation }>(response)).data;
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
    `Project preparation did not reach ${expected.join("/")}; last status ${last.status}; error ${JSON.stringify(last.error)}; report ${JSON.stringify(last.report)}`,
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
    `No command reached ${expected.join("/")}; last status ${last.status}`,
  );
}

function appWith(model: FakeRecoveryModel, root: string) {
  return createApp({
    llm: model,
    workspaceRoot: () => join(root, "workspaces"),
  });
}

async function recoveredChallenge(
  handler: Handler,
  root: string,
  status: string[] = ["failed"],
) {
  const model = new FakeRecoveryModel(handler);
  const app = appWith(model, root);
  const owner = await startProfile(
    app,
    `recovery-${crypto.randomUUID()}@test.dev`,
  );
  const challenge = await createChallenge(app, owner.id);
  const first = await waitForStatus(app, owner.id, challenge.id, status);
  return { model, app, owner, challenge, first };
}

async function assertOwnedRecovery(
  app: TestApp,
  strangerId: string,
  challengeId: string,
) {
  for (const [path, body] of [
    [`/challenges/${challengeId}/project-preparation`, undefined],
    [`/challenges/${challengeId}/project-preparation/retry`, {}],
    [`/challenges/${challengeId}/project-preparation/resume`, {}],
    [`/challenges/${challengeId}/project-preparation/fresh`, {}],
  ] as const) {
    const response = await request(app, path, strangerId, body);
    expect(response.status).toBe(404);
  }
}

describe("project preparation recovery", () => {
  test("interruption before file writes preserves partial state and resume continues the folder", async () => {
    let call = 0;
    const handler: Handler = async (input, index) => {
      call = index;
      if (index === 0) return waitUntilAborted(input);
      await writeProjectFiles(input, projectFiles);
      return completeFromDisk(input, "Continued the partial project.");
    };
    const root = await tempRoot();
    const model = new FakeRecoveryModel(handler);
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `recovery-cancel-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    await waitForStatus(app, owner.id, challenge.id, ["running"]);
    const cancelled = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/cancel`,
      owner.id,
      {},
    );
    expect(cancelled.status).toBe(200);
    const beforeWrites = (await json<{ data: ProjectPreparation }>(cancelled))
      .data;
    expect(beforeWrites.status).toBe("cancelled");
    expect(beforeWrites.recovery.canResume).toBe(true);
    expect(beforeWrites.recovery.canRetry).toBe(true);
    const challengeFile = join(beforeWrites.projectPath!, "CHALLENGE.md");
    expect((await stat(challengeFile)).isFile()).toBe(true);

    const resumed = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/resume`,
      owner.id,
      {},
    );
    expect(resumed.status).toBe(202);
    const running = await waitForStatus(app, owner.id, challenge.id, [
      "running",
    ]);
    expect(running.attempt).toBe(2);
    expect(running.projectDirectory).toBe("project");
    expect(running.mode).toBe("resume");
    // The first run wrote only CHALLENGE.md; resume added the real files.
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
    expect(call).toBe(1);
    expect(ready.attempt).toBe(2);
    expect(ready.projectDirectory).toBe("project");
    for (const file of projectFiles)
      expect((await stat(join(ready.projectPath!, file.path))).isFile()).toBe(
        true,
      );
    expect(ready.previousAttempt?.projectDirectory).toBe("project");
    expect(model.inputs[1]?.continuation).toMatchObject({
      resumedFromAttempt: 1,
    });
    expect(ready.recovery.canResume).toBe(false);
    expect(ready.recovery.canRetry).toBe(false);
  });

  test("cancel stops an approved command process group and a stale approval never runs", async () => {
    const root = await tempRoot();
    const model = new FakeRecoveryModel(async (input, index) => {
      if (index === 0) {
        await writeProjectFiles(input, projectFiles);
        const run = input.runProjectCommand!;
        const result = await run({
          purpose: "check",
          checkId: "todo-exercise",
          command:
            "bun -e \"setTimeout(() => require('fs').writeFileSync('late-command.txt', 'late'), 700)\"",
          cwd: ".",
          install: false,
          network: false,
        });
        return completeFromDisk(
          input,
          result.status === "cancelled"
            ? "Command cancelled."
            : "Command finished.",
        );
      }
      await writeProjectFiles(input, projectFiles);
      return completeFromDisk(input, "Files prepared.");
    });
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `recovery-command-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const pending = await waitForCommand(app, owner.id, challenge.id, [
      "pending",
    ]);
    const approve = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/commands/${pending.command.id}/approve`,
      owner.id,
      {},
    );
    expect(approve.status).toBe(200);
    await waitForCommand(app, owner.id, challenge.id, ["running"]);
    const cancelled = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/cancel`,
      owner.id,
      {},
    );
    expect(cancelled.status).toBe(200);
    const state = (await json<{ data: ProjectPreparation }>(cancelled)).data;
    expect(state.status).toBe("cancelled");
    expect(
      state.commands.find((command) => command.id === pending.command.id)
        ?.status,
    ).toBe("cancelled");
    await Bun.sleep(900);
    await expect(
      stat(join(model.inputs[0]!.layout.projectRoot, "late-command.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const stale = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/commands/${pending.command.id}/approve`,
      owner.id,
      {},
    );
    expect(stale.status).toBe(409);
    expect((await json<{ error: { code: string } }>(stale)).error.code).toBe(
      "PROJECT_COMMAND_STALE",
    );
  });

  test("cancel preserves generated files and late tool writes stay fenced", async () => {
    const root = await tempRoot();
    const model = new FakeRecoveryModel(async (input) => {
      await writeProjectFiles(input, projectFiles);
      return waitUntilAborted(input);
    });
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `recovery-late-write-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    await waitForStatus(app, owner.id, challenge.id, ["running"]);
    const end = Date.now() + 5_000;
    while (Date.now() < end && !model.inputs[0]?.layout.projectRoot)
      await Bun.sleep(10);
    const layout = model.inputs[0]!.layout;
    const main = join(layout.projectRoot, "src", "main.ts");
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        await stat(main);
        break;
      } catch {
        await Bun.sleep(10);
      }
    }
    expect((await stat(main)).isFile()).toBe(true);
    const cancelled = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/cancel`,
      owner.id,
      {},
    );
    expect(cancelled.status).toBe(200);
    expect((await stat(main)).isFile()).toBe(true);

    const lateTools = createProjectTools({
      root: layout.projectRoot,
      journal: projectToolJournalContext(layout),
      signal: model.inputs[0]!.signal,
    });
    const create = lateTools.find(
      (tool) => tool.name === "create_project_file",
    )!;
    await expect(
      create.execute(
        "late-call",
        { path: "late-after-cancel.ts", content: "late\n" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_OPERATION_CANCELLED" });
    await expect(
      stat(join(layout.projectRoot, "late-after-cancel.ts")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("resume recreates only journaled missing files and keeps edited files untouched", async () => {
    const root = await tempRoot();
    const { model, app, owner, challenge, first } = await recoveredChallenge(
      failAfterFiles,
      root,
    );
    const missing = join(first.projectPath!, "README.md");
    await unlink(missing);
    model.handler = async (input) => {
      // The new run can inspect existing files and recreate only the tracked
      // missing file explicitly reported by the backend.
      expect(input.continuation?.missingFiles).toContain("README.md");
      const read = toolsFor(input).find(
        (tool) => tool.name === "read_project_file",
      )!;
      const content = await read.execute(
        "read",
        { path: "src/main.ts" },
        undefined,
      );
      expect(JSON.stringify(content)).toContain("TODO");
      await createFile(
        input,
        "README.md",
        "# URL shortener\n\nRecreated from the frozen context.\n",
      );
      return completeFromDisk(input, "Recreated the missing README.");
    };
    const inspected = await preparation(app, owner.id, challenge.id);
    expect(inspected.recovery.canResume).toBe(true);
    expect(inspected.recovery.missingFiles).toEqual(["README.md"]);
    const resumed = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/resume`,
      owner.id,
      {},
    );
    expect(resumed.status).toBe(202);
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
    expect(ready.projectPath).toBe(first.projectPath);
    expect(await readFile(missing, "utf8")).toContain("Recreated");
    expect(
      await readFile(join(first.projectPath!, "src", "main.ts"), "utf8"),
    ).toContain("TODO");
  });

  test("a user edit blocks resume with a specific path and fresh keeps the edit", async () => {
    const root = await tempRoot();
    const { model, app, owner, challenge, first } = await recoveredChallenge(
      failAfterFiles,
      root,
    );
    const edited = join(first.projectPath!, "src", "main.ts");
    const userContent = "// my edit\nexport const answer = 42;\n";
    await writeFile(edited, userContent);
    const inspected = await preparation(app, owner.id, challenge.id);
    expect(inspected.recovery.canResume).toBe(false);
    expect(inspected.recovery.resumeStatus).toBe("file_modified");
    expect(inspected.recovery.conflictPath).toBe("src/main.ts");
    expect(inspected.recovery.canRetry).toBe(true);
    expect(inspected.recovery.canFresh).toBe(true);

    model.handler = async (input) => {
      await writeProjectFiles(input, projectFiles);
      return completeFromDisk(input, "Started a fresh project folder.");
    };
    const resume = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/resume`,
      owner.id,
      {},
    );
    expect(resume.status).toBe(409);
    const resumeError = await json<{
      error: { code: string; details?: { path?: string } };
    }>(resume);
    expect(resumeError.error.code).toBe("PROJECT_FILE_MODIFIED");
    expect(resumeError.error.details?.path).toBe("src/main.ts");
    expect(await readFile(edited, "utf8")).toBe(userContent);
    expect(model.inputs).toHaveLength(1);

    const fresh = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/fresh`,
      owner.id,
      {},
    );
    expect(fresh.status).toBe(202);
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
    expect(ready.attempt).toBe(2);
    expect(ready.projectDirectory).toBe("project-2");
    expect(ready.mode).toBe("fresh");
    expect(ready.projectPath).not.toBe(first.projectPath);
    expect(await readFile(edited, "utf8")).toBe(userContent);
    expect(model.inputs[1]?.previousAttempt).toBeNull();
    expect(model.inputs[1]?.continuation).toBeNull();
  });

  test("corrupt and missing journals fail resume closed while fresh ignores them", async () => {
    for (const kind of ["corrupt", "missing"] as const) {
      const root = await tempRoot();
      const { model, app, owner, challenge, first } = await recoveredChallenge(
        failAfterFiles,
        root,
      );
      const journalPath = join(
        dirname(first.projectPath!),
        projectMetadataDirectory,
        projectJournalDirectory,
        "project.json",
      );
      if (kind === "corrupt") await writeFile(journalPath, "{ not json");
      else await unlink(journalPath);
      const inspected = await preparation(app, owner.id, challenge.id);
      expect(inspected.recovery.canResume).toBe(false);
      expect(inspected.recovery.resumeStatus).toBe(
        kind === "corrupt" ? "journal_invalid" : "journal_missing",
      );
      expect(inspected.recovery.canFresh).toBe(true);
      const resume = await request(
        app,
        `/challenges/${challenge.id}/project-preparation/resume`,
        owner.id,
        {},
      );
      expect(resume.status).toBe(409);
      const body = await json<{ error: { code: string } }>(resume);
      expect(body.error.code).toBe(
        kind === "corrupt"
          ? "PROJECT_PREPARATION_JOURNAL_INVALID"
          : "PROJECT_PREPARATION_JOURNAL_MISSING",
      );
      model.handler = async (input) => {
        await writeProjectFiles(input, projectFiles);
        return completeFromDisk(input, "Fresh folder prepared.");
      };
      const fresh = await request(
        app,
        `/challenges/${challenge.id}/project-preparation/fresh`,
        owner.id,
        {},
      );
      expect(fresh.status).toBe(202);
      const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
      expect(ready.projectDirectory).toBe("project-2");
      expect(
        (await stat(join(first.projectPath!, "src", "main.ts"))).isFile(),
      ).toBe(true);
      if (kind === "corrupt")
        expect(await readFile(journalPath, "utf8")).toBe("{ not json");
      else
        await expect(stat(journalPath)).rejects.toMatchObject({
          code: "ENOENT",
        });
    }
  });

  test("resume reports a journal save failure before writing another project file", async () => {
    if (process.getuid?.() === 0) return;
    const root = await tempRoot();
    const { model, app, owner, challenge, first } = await recoveredChallenge(
      failAfterFiles,
      root,
    );
    model.handler = async (input) => {
      await createFile(
        input,
        "src/extra-wiring.ts",
        "export const extra = 1;\n",
      );
      return completeFromDisk(input, "Should not complete.");
    };
    const journalDirectory = join(
      dirname(first.projectPath!),
      projectMetadataDirectory,
      projectJournalDirectory,
    );
    await chmod(journalDirectory, 0o500);
    try {
      const resumed = await request(
        app,
        `/challenges/${challenge.id}/project-preparation/resume`,
        owner.id,
        {},
      );
      expect(resumed.status).toBe(202);
      const failed = await waitForStatus(app, owner.id, challenge.id, [
        "failed",
      ]);
      expect(failed.error?.code).toBe("PROJECT_METADATA_UNAVAILABLE");
      await expect(
        stat(join(first.projectPath!, "src", "extra-wiring.ts")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        (await stat(join(first.projectPath!, "src", "main.ts"))).isFile(),
      ).toBe(true);
    } finally {
      await chmod(journalDirectory, 0o700);
    }
  });

  test("retry preserves the saved frozen specification in a new folder", async () => {
    const root = await tempRoot();
    const { model, app, owner, challenge, first } = await recoveredChallenge(
      failAfterFiles,
      root,
    );
    const saved = first.specification!;
    expect(first.recovery.canRetry).toBe(true);
    model.handler = async (input) => {
      await writeProjectFiles(input, projectFiles);
      return completeFromDisk(input, "Retried the saved specification.");
    };
    const retried = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/retry`,
      owner.id,
      {},
    );
    expect(retried.status).toBe(202);
    const ready = await waitForStatus(app, owner.id, challenge.id, ["ready"]);
    expect(ready.attempt).toBe(2);
    expect(ready.projectDirectory).toBe("project-2");
    expect(ready.mode).toBe("retry");
    expect(ready.specification).toEqual(saved);
    expect(model.inputs[1]?.specification).toEqual(saved);
    expect(model.inputs[1]?.previousAttempt).toMatchObject({
      attempt: 1,
      status: "failed",
    });
    expect(
      (await stat(join(first.projectPath!, "src", "main.ts"))).isFile(),
    ).toBe(true);
    expect(
      (await stat(join(ready.projectPath!, "CHALLENGE.md"))).isFile(),
    ).toBe(true);
  });

  test("concurrent resume requests create one fenced run, not competing writers", async () => {
    const root = await tempRoot();
    const { model, app, owner, challenge } = await recoveredChallenge(
      failAfterFiles,
      root,
    );
    model.handler = async (input) => {
      await createFile(input, "src/resume-wiring.ts", "export const x = 1;\n");
      return waitUntilAborted(input);
    };
    const [one, two] = await Promise.all([
      request(
        app,
        `/challenges/${challenge.id}/project-preparation/resume`,
        owner.id,
        {},
      ),
      request(
        app,
        `/challenges/${challenge.id}/project-preparation/resume`,
        owner.id,
        {},
      ),
    ]);
    expect(one.status).toBe(202);
    expect(two.status).toBe(202);
    const firstBody = (await json<{ data: ProjectPreparation }>(one)).data;
    const secondBody = (await json<{ data: ProjectPreparation }>(two)).data;
    expect(firstBody.attempt).toBe(2);
    expect(secondBody.attempt).toBe(2);
    expect(model.inputs).toHaveLength(2);
    await waitForStatus(app, owner.id, challenge.id, ["running"]);
    const cancelled = await request(
      app,
      `/challenges/${challenge.id}/project-preparation/cancel`,
      owner.id,
      {},
    );
    expect(cancelled.status).toBe(200);
  });

  test("restart marks the attempt interrupted and resume continues the same folder", async () => {
    const root = await tempRoot();
    let resumeHandler = false;
    const model = new FakeRecoveryModel(async (input) => {
      if (!resumeHandler) {
        await writeProjectFiles(input, projectFiles);
        return waitUntilAborted(input);
      }
      const edit = toolsFor(input).find(
        (tool) => tool.name === "edit_project_file",
      )!;
      await edit.execute(
        "edit",
        {
          path: "src/wiring.ts",
          oldText: "wiringReady",
          newText: "wiringReadyAfterRestart",
        },
        undefined,
      );
      return completeFromDisk(input, "Resumed after restart.");
    });
    const app = appWith(model, root);
    const owner = await startProfile(
      app,
      `recovery-restart-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    await waitForStatus(app, owner.id, challenge.id, ["running"]);
    // Stop only after every file is journaled. Resume recreates only journaled
    // missing files, so a partial journal cannot satisfy project validation.
    const journalPath = model.inputs[0]!.layout.journalPath;
    for (let attempt = 0; attempt < 400; attempt++) {
      try {
        const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
          files: Record<string, unknown>;
        };
        if (projectFiles.every((file) => journal.files[file.path])) break;
      } catch {
        // Keep polling until the journal lands.
      }
      await Bun.sleep(10);
    }
    await app.projectPreparations.stop();
    const interrupted = await waitForStatus(app, owner.id, challenge.id, [
      "interrupted",
    ]);
    expect(interrupted.recovery.canResume).toBe(true);
    const reopened = appWith(model, root);
    await reopened.projectPreparations.recover();
    resumeHandler = true;
    const resumed = await request(
      reopened,
      `/challenges/${challenge.id}/project-preparation/resume`,
      owner.id,
      {},
    );
    expect(resumed.status).toBe(202);
    const ready = await waitForStatus(reopened, owner.id, challenge.id, [
      "ready",
    ]);
    expect(ready.attempt).toBe(2);
    expect(ready.projectPath).toBe(interrupted.projectPath);
    expect(ready.mode).toBe("resume");
    expect(model.inputs[1]?.continuation?.resumedFromAttempt).toBe(1);
  });

  test("recovery preserves ownership and defaults legacy rows to the start mode", async () => {
    const root = await tempRoot();
    const { app, owner, challenge, first } = await recoveredChallenge(
      failAfterFiles,
      root,
    );
    const stranger = await startProfile(
      app,
      `recovery-stranger-${crypto.randomUUID()}@test.dev`,
    );
    await assertOwnedRecovery(app, stranger.id, challenge.id);

    const row = await projectPreparationModel.latest(challenge.id);
    const sqlite = sqliteDatabase().sqlite;
    sqlite
      .query(
        `INSERT INTO project_preparations (
          id, profile_id, challenge_id, attempt, project_directory, project_path,
          specification, status, activity, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'interrupted', '[]', ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        owner.id,
        challenge.id,
        90,
        row!.projectDirectory,
        first.projectPath!,
        JSON.stringify(row!.specification),
        Date.now(),
        Date.now(),
      );
    const legacy = await preparation(app, owner.id, challenge.id);
    expect(legacy.attempt).toBe(90);
    expect(legacy.mode).toBe("start");
    expect(legacy.recovery.canRetry).toBe(true);
    expect(legacy.recovery.canFresh).toBe(true);
    expect(legacy.previousAttempt).toMatchObject({
      attempt: 1,
      projectDirectory: "project",
    });
  });
});

test("the latest schema keeps a defaulted preparation mode without touching older rows", async () => {
  const root = await tempRoot();
  const db = (
    await import("@repo/backend/shared/database/db.sqlite")
  ).createSqliteDatabase(join(root, "schema.sqlite"));
  try {
    await db.migrateDatabase();
    const version = (
      db.sqlite.query("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    expect(version).toBe(12);
    const columns = db.sqlite
      .query("PRAGMA table_info(project_preparations)")
      .all() as { name: string; dflt_value: string | null; notnull: number }[];
    const mode = columns.find((column) => column.name === "mode");
    expect(mode).toMatchObject({ dflt_value: "'start'", notnull: 1 });
  } finally {
    db.close();
  }
});
