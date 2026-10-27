import type { GuidedPreferences } from "@repo/preferences";
import { sql } from "drizzle-orm";
import type {
  QuizAnswers,
  QuizQuestion,
} from "../../modules/quizzes/quiz.schema";
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Bun SQL already decodes timestamps to Date. The standard timestamp mapper
// expects strings and would lose milliseconds and reinterpret the local zone.
const contextTimestamp = customType<{ data: Date; driverData: Date | string }>({
  dataType: () => "timestamp",
  fromDriver: (value) =>
    value instanceof Date
      ? value
      : new Date(
          value.replace(" ", "T") +
            (/Z$|[+-]\d{2}:?\d{2}$/.test(value) ? "" : "Z"),
        ),
  toDriver: (value) => value.toISOString(),
});

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const profilePreferences = pgTable("profile_preferences", {
  profileId: text("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  guidedPreferences: jsonb("guided_preferences")
    .$type<GuidedPreferences>()
    .notNull(),
  aboutMe: text("about_me"),
  developerContextUpdatedAt: contextTimestamp("developer_context_updated_at"),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Allocated by database triggers, independently for each profile and kind.
// Keeping the counters outside the records prevents number reuse after deletion.
export const generationCounters = pgTable(
  "generation_counters",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["quiz", "challenge"] }).notNull(),
    value: integer("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.kind] }),
    check("generation_counters_value_check", sql`${table.value} > 0`),
    check(
      "generation_counters_kind_check",
      sql`${table.kind} in ('quiz', 'challenge')`,
    ),
  ],
);

export const challenges = pgTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    number: integer("challenge_number").notNull().default(0),
    title: text("title").notNull(),
    scope: text("scope", {
      enum: ["focused", "feature", "system"],
    }).notNull(),
    difficulty: text("difficulty", {
      enum: ["easy", "medium", "hard", "grill"],
    }).notNull(),
    estimatedDifficultyScore: integer("estimated_difficulty_score"),
    difficultyReason: text("difficulty_reason"),
    topic: text("topic"),
    implementationBoundary: text("implementation_boundary"),
    contextSnapshot: jsonb("context_snapshot").$type<Record<string, unknown>>(),
    promptVersion: text("prompt_version"),
    calibrationVersion: text("calibration_version"),
    contractVersion: integer("contract_version").notNull().default(1),
    completionSource: text("completion_source", {
      enum: ["judge", "legacy", "user"],
    }),
    contextualDifficulty: text("contextual_difficulty", {
      enum: ["easy", "medium", "hard", "grill"],
    }).notNull(),
    durationMinMinutes: integer("duration_min_minutes").notNull(),
    durationMaxMinutes: integer("duration_max_minutes").notNull(),
    implementationMilestones: jsonb("implementation_milestones")
      .$type<string[]>()
      .notNull(),
    problemStatement: text("problem_statement").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    constraints: jsonb("constraints").$type<string[]>().notNull(),
    starterCode: text("starter_code"),
    completionCriteria: jsonb("completion_criteria")
      .$type<string[]>()
      .notNull(),
    hint: text("hint"),
    status: text("status", {
      enum: ["active", "paused", "saved", "stopped", "completed"],
    })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: timestamp("completed_at", { mode: "date" }),
    archivedAt: timestamp("archived_at", { mode: "date" }),
  },
  (table) => [
    check("challenges_number_positive", sql`${table.number} > 0`),
    uniqueIndex("challenges_profile_number_unique").on(
      table.profileId,
      table.number,
    ),
  ],
);

export const quizzes = pgTable(
  "quizzes",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").references(() => challenges.id, {
      onDelete: "cascade",
    }),
    topic: text("topic"),
    title: text("title"),
    difficulty: text("difficulty", {
      enum: ["easy", "medium", "hard", "grill"],
    }),
    // The BEFORE INSERT trigger replaces this default with the next number.
    number: integer("quiz_number").notNull().default(0),
    requestId: text("request_id").notNull(),
    questionCount: integer("question_count").notNull(),
    coverage: text("coverage", {
      enum: ["challenge", "related", "mixed", "topic"],
    }).notNull(),
    questions: jsonb("questions").$type<QuizQuestion[]>().notNull(),
    contextSnapshot: jsonb("context_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    check("quizzes_number_positive", sql`${table.number} > 0`),
    uniqueIndex("quizzes_challenge_request_unique").on(
      table.challengeId,
      table.requestId,
    ),
    uniqueIndex("quizzes_profile_number_unique").on(
      table.profileId,
      table.number,
    ),
    uniqueIndex("quizzes_profile_request_unique")
      .on(table.profileId, table.requestId)
      .where(sql`${table.challengeId} is null`),
    index("quizzes_profile_deleted_number_idx").on(
      table.profileId,
      table.deletedAt,
      table.number,
    ),
    index("quizzes_challenge_deleted_number_idx").on(
      table.challengeId,
      table.deletedAt,
      table.number,
    ),
    check(
      "quizzes_scope_check",
      sql`(${table.challengeId} is not null and ${table.coverage} in ('challenge', 'related', 'mixed')) or (${table.challengeId} is null and ${table.coverage} = 'topic' and ${table.topic} is not null and ${table.difficulty} is not null)`,
    ),
  ],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    number: integer("attempt_number").notNull(),
    status: text("status", { enum: ["draft", "submitted"] })
      .notNull()
      .default("draft"),
    answers: jsonb("answers").$type<QuizAnswers>().notNull().default({}),
    revision: integer("revision").notNull().default(0),
    score: integer("score"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    submittedAt: timestamp("submitted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("quiz_attempts_quiz_number_unique").on(
      table.quizId,
      table.number,
    ),
  ],
);

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  mode: text("mode", {
    enum: ["generate", "clarify", "review", "hint"],
  }).notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments")
    .$type<{ filename: string; text: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const aiLogs = pgTable(
  "ai_logs",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").references(() => challenges.id, {
      onDelete: "set null",
    }),
    operation: text("operation", {
      enum: [
        "preparation",
        "prompt_enhancement",
        "generation",
        "clarify",
        "review",
        "hint",
        "quiz_generation",
        "quiz_title_generation",
        "resume_import",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["running", "success", "error", "cancelled"],
    }).notNull(),
    requestedModel: text("requested_model").notNull(),
    actualModel: text("actual_model"),
    endpoint: text("endpoint").notNull(),
    providerRequestId: text("provider_request_id"),
    streamed: boolean("streamed").notNull(),
    preview: text("preview").notNull(),
    startedAt: timestamp("started_at", { mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    durationMs: integer("duration_ms"),
    firstTokenMs: integer("first_token_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    cachedTokens: integer("cached_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    costUsd: doublePrecision("cost_usd"),
    requestBody: jsonb("request_body")
      .$type<Record<string, unknown>>()
      .notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    responseText: text("response_text").notNull().default(""),
    streamEvents: jsonb("stream_events").$type<unknown[]>(),
    error: jsonb("error").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("ai_logs_profile_started_idx").on(
      table.profileId,
      table.startedAt,
      table.id,
    ),
    index("ai_logs_profile_status_idx").on(
      table.profileId,
      table.status,
      table.startedAt,
    ),
  ],
);

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  root: text("root").notNull(),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const submissions = pgTable("submissions", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  contractVersion: integer("contract_version").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments")
    .$type<{ filename: string; text: string }[]>()
    .notNull(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  snapshotPath: text("snapshot_path").notNull(),
  manifest: jsonb("manifest")
    .$type<{ path: string; sha256: string; bytes: number }[]>()
    .notNull(),
  gitContext: jsonb("git_context").$type<Record<string, string | null>>(),
  assistance: jsonb("assistance")
    .$type<{ hints: number; guidance: boolean }>()
    .notNull(),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reviewJobs = pgTable("review_jobs", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  judge: text("judge", { enum: ["omniroute", "codex"] }).notNull(),
  routingReason: text("routing_reason").notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed", "cancelled"],
  }).notNull(),
  progress: text("progress").notNull(),
  response:
    jsonb("response").$type<
      import("../../modules/reviews/review.schema").ReviewResult
    >(),
  score: integer("score"),
  error: text("error"),
  followup: text("followup"),
  aiLogId: text("ai_log_id"),
  providerThreadId: text("provider_thread_id"),
  providerTurnId: text("provider_turn_id"),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

export const verificationRuns = pgTable("verification_runs", {
  id: text("id").primaryKey(),
  reviewId: text("review_id")
    .notNull()
    .references(() => reviewJobs.id, { onDelete: "cascade" }),
  evidence: jsonb("evidence")
    .$type<import("../../modules/reviews/review.schema").VerificationEvidence>()
    .notNull(),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const aiLogEvents = pgTable(
  "ai_log_events",
  {
    id: serial("id").primaryKey(),
    logId: text("log_id")
      .notNull()
      .references(() => aiLogs.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    payload: jsonb("payload").$type<unknown>().notNull(),
  },
  (table) => [index("ai_log_events_log_idx").on(table.logId, table.id)],
);
