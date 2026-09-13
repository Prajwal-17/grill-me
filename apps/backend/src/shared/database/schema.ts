import type { GuidedPreferences } from "@repo/preferences";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const profilePreferences = sqliteTable("profile_preferences", {
  profileId: text("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  guidedPreferences: text("guided_preferences", {
    mode: "json",
  })
    .$type<GuidedPreferences>()
    .notNull(),
  aboutMe: text("about_me"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const challenges = sqliteTable(
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
    contextSnapshot: text("context_snapshot", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
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
    implementationMilestones: text("implementation_milestones", {
      mode: "json",
    })
      .$type<string[]>()
      .notNull(),
    problemStatement: text("problem_statement").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    constraints: text("constraints", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    starterCode: text("starter_code"),
    completionCriteria: text("completion_criteria", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    hint: text("hint"),
    status: text("status", {
      enum: ["active", "paused", "saved", "stopped", "completed"],
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("challenges_profile_number_unique").on(
      table.profileId,
      table.number,
    ),
  ],
);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  mode: text("mode", {
    enum: ["generate", "clarify", "review", "hint"],
  }).notNull(),
  content: text("content").notNull(),
  attachments: text("attachments", { mode: "json" })
    .$type<{ filename: string; text: string }[]>()
    .notNull()
    .default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const aiLogs = sqliteTable(
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
      enum: ["preparation", "generation", "clarify", "review", "hint"],
    }).notNull(),
    status: text("status", {
      enum: ["running", "success", "error", "cancelled"],
    }).notNull(),
    requestedModel: text("requested_model").notNull(),
    actualModel: text("actual_model"),
    endpoint: text("endpoint").notNull(),
    providerRequestId: text("provider_request_id"),
    streamed: integer("streamed", { mode: "boolean" }).notNull(),
    preview: text("preview").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    durationMs: integer("duration_ms"),
    firstTokenMs: integer("first_token_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    cachedTokens: integer("cached_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    costUsd: real("cost_usd"),
    requestBody: text("request_body", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    responseBody: text("response_body", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    responseText: text("response_text").notNull().default(""),
    streamEvents: text("stream_events", { mode: "json" }).$type<unknown[]>(),
    error: text("error", { mode: "json" }).$type<Record<string, unknown>>(),
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

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  root: text("root").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  contractVersion: integer("contract_version").notNull(),
  content: text("content").notNull(),
  attachments: text("attachments", { mode: "json" })
    .$type<{ filename: string; text: string }[]>()
    .notNull(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  snapshotPath: text("snapshot_path").notNull(),
  manifest: text("manifest", { mode: "json" })
    .$type<{ path: string; sha256: string; bytes: number }[]>()
    .notNull(),
  gitContext: text("git_context", { mode: "json" }).$type<
    Record<string, string | null>
  >(),
  assistance: text("assistance", { mode: "json" })
    .$type<{ hints: number; guidance: boolean }>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reviewJobs = sqliteTable("review_jobs", {
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
  response: text("response", { mode: "json" }).$type<
    import("../../modules/reviews/review.schema").ReviewResult
  >(),
  score: integer("score"),
  error: text("error"),
  followup: text("followup"),
  aiLogId: text("ai_log_id"),
  providerThreadId: text("provider_thread_id"),
  providerTurnId: text("provider_turn_id"),
  promptVersion: text("prompt_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const verificationRuns = sqliteTable("verification_runs", {
  id: text("id").primaryKey(),
  reviewId: text("review_id")
    .notNull()
    .references(() => reviewJobs.id, { onDelete: "cascade" }),
  evidence: text("evidence", { mode: "json" })
    .$type<import("../../modules/reviews/review.schema").VerificationEvidence>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const aiLogEvents = sqliteTable(
  "ai_log_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    logId: text("log_id")
      .notNull()
      .references(() => aiLogs.id, { onDelete: "cascade" }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
  },
  (table) => [index("ai_log_events_log_idx").on(table.logId, table.id)],
);
