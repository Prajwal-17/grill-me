import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
    let attempt = 0;
    const app = createApp({
      llm: fakeModel(async () =>
        attempt++ === 0
          ? result()
          : result({
              criteria: result().criteria.map((entry) => ({
                ...entry,
                status: "pass" as const,
              })),
            }),
      ),
    });
    await http(app, `/challenges/${challengeId}/review`, profileId, "POST");
    await http(app, `/challenges/${challengeId}/review`, profileId, "POST");
    const listed = await http(
      app,
      `/challenges/${challengeId}/reviews`,
      profileId,
    );
    const reviews = (await listed.json()).data;
    expect(reviews).toHaveLength(2);
    expect(reviews[0].verdict).toBe("meets");
    expect(reviews[1].verdict).toBe("partly_meets");
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
