import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelGateway } from "@repo/backend/modules/ai/model-gateway";
import { createReviewTools } from "@repo/backend/modules/ai/agent/tools/review";
import {
  deriveReviewVerdict,
  validateReviewResult,
} from "@repo/backend/modules/reviews/review.schema";
import type { ChallengeReviewResult } from "@repo/backend/shared/contracts";
import { fixtureSql } from "./fixture-sql";
import { harnessService } from "@repo/backend/modules/harness/harness.service";

const roots: string[] = [];
async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "grill-review-"));
  roots.push(root);
  return root;
}

const { createApp } = await import("@repo/backend/app");
const { migrateDatabase } = await import("@repo/backend/shared/database/db");
await migrateDatabase();

// Other suites share this database, so this file only ever touches the profiles
// it creates. Deleting a profile cascades to its challenges, reviews, and runs.
const created: string[] = [];

afterAll(async () => {
  for (const profileId of created)
    await fixtureSql("DELETE FROM profiles WHERE id = $1", [profileId]);
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

const criteria = [
  "Groups every word by its first letter.",
  "Empty input returns an empty object.",
];

async function seed(options: { workspace?: string | null } = {}) {
  const profileId = crypto.randomUUID();
  created.push(profileId);
  const challengeId = crypto.randomUUID();
  await fixtureSql(
    "INSERT INTO profiles (id, email, created_at, updated_at) VALUES ($1, $2, 1000, 1000)",
    [profileId, `review-${profileId}@test.local`],
  );
  await fixtureSql(
    `INSERT INTO challenges (
      id, profile_id, challenge_number, title, scope, difficulty,
      contextual_difficulty, duration_min_minutes, duration_max_minutes,
      implementation_milestones, problem_statement, expected_outcome,
      completion_criteria, workspace_path, created_at
    ) VALUES ($1, $2, 1, 'Group words', 'focused', 'medium', 'medium', 15, 30,
      '[]', 'Group words by first letter.', 'A grouping function.',
      $3, $4, 1000)`,
    [
      challengeId,
      profileId,
      criteria,
      options.workspace === undefined ? null : options.workspace,
    ],
  );
  return { profileId, challengeId };
}

function result(overrides: Partial<ChallengeReviewResult> = {}) {
  return {
    criteria: [
      {
        criterion: criteria[0]!,
        status: "pass" as const,
        evidence: "maps each word into a bucket keyed by its first letter",
        path: "solution.ts",
        line: 4,
      },
      {
        criterion: criteria[1]!,
        status: "fail" as const,
        evidence: "no empty-input branch exists",
        path: null,
        line: null,
      },
    ],
    strengths: ["Buckets stay ordered and every word is kept."],
    improvements: [
      {
        problem: "Empty input throws instead of returning {}.",
        fix: "Return an empty object before building buckets.",
      },
    ],
    nextStep: "Handle the empty input before iterating words.",
    ...overrides,
  };
}

function fakeModel(review: () => Promise<ChallengeReviewResult>): ModelGateway {
  return {
    async reviewChallenge() {
      return review();
    },
    async prepareBuild() {
      throw new Error("unused");
    },
    async generateBuild() {
      throw new Error("unused");
    },
    async respond() {
      throw new Error("unused");
    },
    async generateHint() {
      throw new Error("unused");
    },
  } as unknown as ModelGateway;
}

function toolText(result: unknown) {
  const content = (result as { content?: { text?: string }[] }).content ?? [];
  return content.map((item) => item.text ?? "").join("\n");
}

describe("retired hints and discussions", () => {
  test("blocks generation and retry while preserving owned archived records", async () => {
    const { profileId, challengeId } = await seed();
    let calls = 0;
    const llm = fakeModel(async () => result());
    llm.respond = async function* () {
      calls++;
      yield "Must not run";
    };
    llm.generateHint = async function* () {
      calls++;
      yield "Must not run";
    };
    const app = createApp({ llm });
    const thread = await harnessService.createThread({
      profileId,
      challengeId,
      kind: "hint",
      title: "Archived hint",
      model: "fixture",
    });
    const run = await harnessService.begin({
      threadId: thread.id,
      inputText: "Hint",
    });
    await run.recorder.append({
      type: "assistant_message",
      text: "Keep this archived hint.",
    });
    await run.recorder.finish({ status: "failed" });
    for (const path of [
      `/challenges/${challengeId}/hint`,
      `/challenges/${challengeId}/messages`,
      `/challenges/${challengeId}/messages/${crypto.randomUUID()}/retry`,
      `/harness/${thread.id}/retry`,
      `/harness/${thread.id}/turns`,
    ]) {
      const response = await http(app, path, profileId, "POST");
      expect(response.status).toBe(410);
      expect((await response.json()).error.code).toBe("FEATURE_REMOVED");
    }
    expect(calls).toBe(0);
    const archived = await http(
      app,
      `/challenges/${challengeId}/messages`,
      profileId,
    );
    expect(archived.status).toBe(200);
    expect(
      (await archived.json()).data.some(
        (row: { content: string }) =>
          row.content === "Keep this archived hint.",
      ),
    ).toBe(true);
    const detail = await harnessService.detail(thread.id, profileId);
    expect(detail.turns).toHaveLength(1);
    expect(detail.thread.status).toBe("failed");
    const stranger = await seed();
    expect(
      (
        await http(
          app,
          `/challenges/${challengeId}/messages`,
          stranger.profileId,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await http(
          app,
          `/harness/${thread.id}/retry`,
          stranger.profileId,
          "POST",
        )
      ).status,
    ).toBe(404);
  });
});

function http(
  app: ReturnType<typeof createApp>,
  path: string,
  profileId: string,
  method: "GET" | "POST" = "GET",
) {
  return app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Profile-Id": profileId,
    },
  });
}

describe("challenge review", () => {
  test("stores a criterion scorecard and derives the verdict from the counts", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "solution.ts"),
      "export function group(words) {\n  return {};\n}\n",
    );
    const { profileId, challengeId } = await seed({ workspace: root });
    const app = createApp({ llm: fakeModel(async () => result()) });
    const response = await http(
      app,
      `/challenges/${challengeId}/review`,
      profileId,
      "POST",
    );
    expect(response.status).toBe(201);
    const review = (await response.json()).data;
    expect(review).toMatchObject({
      challengeId,
      verdict: "partly_meets",
      criteriaMet: 1,
      criteriaTotal: 2,
    });
    expect(review.result.criteria[1]).toMatchObject({
      criterion: criteria[1],
      status: "fail",
    });
    expect(review.threadId).toBeTruthy();
    const threads = await fixtureSql(
      "SELECT kind, status FROM harness_threads WHERE challenge_id = $1",
      [challengeId],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ kind: "review" });
    const turns = await fixtureSql(
      "SELECT count(*) AS count FROM harness_turns WHERE thread_id = $1",
      [review.threadId],
    );
    expect(turns[0]!.count).toBe(1);

    const listed = await http(
      app,
      `/challenges/${challengeId}/reviews`,
      profileId,
    );
    const reviews = (await listed.json()).data;
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe(review.id);
  });

  test("keeps earlier reviews and returns the newest first", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "solution.ts"),
      "export const group = () => ({});\n",
    );
    const { profileId, challengeId } = await seed({ workspace: root });
    const inspected: string[] = [];
    // Failed runs keep their place in Activity's attempt numbering.
    const failedThread = await harnessService.createThread({
      profileId,
      challengeId,
      kind: "review",
      title: "Earlier failed review",
      model: "deepseek-v4.1-flash",
    });
    const failedRun = await harnessService.begin({
      threadId: failedThread.id,
      inputText: "Review",
    });
    await failedRun.recorder.finish({ status: "failed" });
    const app = createApp({
      llm: fakeModel(async () => {
        const read = createReviewTools(root).find(
          (tool) => tool.name === "read",
        )!;
        const source = toolText(
          await read.execute("read", { path: "solution.ts" }, undefined),
        );
        inspected.push(source);
        return source.includes("return buckets")
          ? result({
              criteria: result().criteria.map((entry) => ({
                ...entry,
                status: "pass" as const,
              })),
            })
          : result();
      }),
    });
    const initial = await http(
      app,
      `/challenges/${challengeId}/review`,
      profileId,
      "POST",
    );
    const first = (await initial.json()).data;
    expect(first.reviewNumber).toBe(2);
    await writeFile(
      join(root, "solution.ts"),
      "export function group(words) { const buckets = {}; for (const word of words) (buckets[word[0]] ??= []).push(word); return buckets; }\n",
    );
    await http(app, `/challenges/${challengeId}/review`, profileId, "POST");
    const listed = await http(
      app,
      `/challenges/${challengeId}/reviews`,
      profileId,
    );
    const reviews = (await listed.json()).data;
    expect(reviews).toHaveLength(2);
    expect(reviews[0].verdict).toBe("meets");
    expect(reviews[0].reviewNumber).toBe(3);
    expect(reviews[1].verdict).toBe("partly_meets");
    expect(reviews[1]).toEqual(first);
    expect(reviews[0].threadId).not.toBe(reviews[1].threadId);
    expect(inspected[0]).not.toContain("return buckets");
    expect(inspected[1]).toContain("return buckets");
  });

  test("refuses reviews without a usable workspace", async () => {
    const { profileId, challengeId } = await seed({ workspace: null });
    const app = createApp({ llm: fakeModel(async () => result()) });
    const missing = await http(
      app,
      `/challenges/${challengeId}/review`,
      profileId,
      "POST",
    );
    expect(missing.status).toBe(409);
    expect((await missing.json()).error.code).toBe("REVIEW_WORKSPACE_MISSING");

    const root = await tempRoot();
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(
      join(root, "node_modules", "dep.js"),
      "module.exports = 1;\n",
    );
    const empty = await seed({ workspace: root });
    const response = await http(
      app,
      `/challenges/${empty.challengeId}/review`,
      empty.profileId,
      "POST",
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REVIEW_WORKSPACE_EMPTY");
  });

  test("keeps reviews scoped to their owner", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "solution.ts"), "export const ready = true;\n");
    const { profileId, challengeId } = await seed({ workspace: root });
    const app = createApp({ llm: fakeModel(async () => result()) });
    const other = crypto.randomUUID();
    created.push(other);
    await fixtureSql(
      "INSERT INTO profiles (id, email, created_at, updated_at) VALUES ($1, $2, 1000, 1000)",
      [other, `other-${other}@test.local`],
    );
    expect(
      (await http(app, `/challenges/${challengeId}/reviews`, other)).status,
    ).toBe(404);
    expect(
      (await http(app, `/challenges/${challengeId}/review`, other, "POST"))
        .status,
    ).toBe(404);
    expect(
      (await http(app, `/challenges/${challengeId}/review`, profileId, "POST"))
        .status,
    ).toBe(201);
  });
});

describe("review validation", () => {
  test("requires one result per criterion in the challenge's order", () => {
    const reversed = result({
      criteria: [...result().criteria].reverse(),
    });
    expect(() => validateReviewResult(reversed, criteria)).toThrow(
      "must be copied exactly",
    );
    expect(() =>
      validateReviewResult(
        result({ criteria: [result().criteria[0]!] }),
        criteria,
      ),
    ).toThrow("exactly 2 criteria results");
  });

  test("rejects a cited file that is not in the workspace inventory", () => {
    const invented = result({
      criteria: [
        { ...result().criteria[0]!, path: "ghost.ts" },
        result().criteria[1]!,
      ],
    });
    expect(() =>
      validateReviewResult(invented, criteria, ["solution.ts"]),
    ).toThrow("not a file in the workspace inventory");
    expect(() =>
      validateReviewResult(result(), criteria, ["solution.ts"]),
    ).not.toThrow();
  });

  test("normalizes whitespace and stores the challenge wording", () => {
    const sloppy = result({
      criteria: [
        {
          ...result().criteria[0]!,
          criterion: "  groups EVERY word by its first letter. ",
        },
        result().criteria[1]!,
      ],
    });
    const validated = validateReviewResult(sloppy, criteria);
    expect(validated.criteria[0]!.criterion).toBe(criteria[0]!);
  });

  test("derives only three verdicts from the judged criteria", () => {
    const entry = (status: "pass" | "partial" | "fail") => ({
      criterion: "x",
      status,
      evidence: "y",
      path: null,
      line: null,
    });
    expect(deriveReviewVerdict([entry("pass"), entry("pass")])).toBe("meets");
    expect(deriveReviewVerdict([entry("pass"), entry("partial")])).toBe(
      "partly_meets",
    );
    expect(deriveReviewVerdict([entry("partial"), entry("fail")])).toBe(
      "partly_meets",
    );
    expect(deriveReviewVerdict([entry("fail"), entry("fail")])).toBe(
      "does_not_meet",
    );
  });
});

describe("review tools", () => {
  test("read-only listing hides dependencies and reads numbered lines", async () => {
    const root = await tempRoot();
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(join(root, "node_modules", "dep.js"), "x\n");
    await writeFile(join(root, "solution.ts"), "one\ntwo\nthree\n");
    const [list, read] = createReviewTools(root);
    const listing = toolText(await list!.execute!("1", {}));
    expect(listing).toContain("solution.ts");
    expect(listing).not.toContain("node_modules");
    const file = await read!.execute!("2", {
      path: "solution.ts",
      lineCount: 2,
    });
    expect(toolText(file)).toContain("1 | one");
    expect(toolText(file)).toContain("2 | two");
    expect(toolText(file)).not.toContain("three");
  });

  test("search is bounded and hides credentials and symlink targets", async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await writeFile(join(root, "solution.ts"), "one\nNeedle\nNeedle again\n");
    await writeFile(join(root, ".env"), "needle credential");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "cache.js"), "needle output");
    await writeFile(join(outside, "secret.ts"), "needle outside");
    await symlink(outside, join(root, "outside"));
    await symlink(join(root, "dist"), join(root, "alias"));
    const tools = createReviewTools(root);
    expect(tools.map((tool) => tool.name)).toEqual(["ls", "read", "grep"]);
    const [list, read, search] = tools;
    const result = await search!.execute("1", {
      query: "needle",
      maxResults: 1,
    });
    expect(toolText(result)).toContain("solution.ts:2: Needle");
    expect(result.details).toEqual({ matches: 1, truncated: true });
    const all = toolText(await search!.execute("2", { query: "needle" }));
    expect(all).not.toMatch(/credential|needle outside|needle output/);
    await expect(list!.execute("3", { path: "outside" })).rejects.toThrow();
    await expect(
      read!.execute("4", { path: "alias/cache.js" }),
    ).rejects.toThrow();
  });

  test("refuses paths outside the workspace and credential files", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "solution.ts"), "ok\n");
    const [, read] = createReviewTools(root);
    await expect(
      read!.execute!("1", { path: "../secret.txt" }),
    ).rejects.toThrow();
    await expect(read!.execute!("2", { path: ".env" })).rejects.toThrow();
  });
});
