import type { GuidedPreferences } from "@repo/preferences";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
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
  }).$type<GuidedPreferences>(),
  experienceLevel: text("experience_level"),
  languagesStack: text("languages_stack"),
  learningGoals: text("learning_goals"),
  aboutMe: text("about_me"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const challenges = sqliteTable("challenges", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type", {
    enum: [
      "implementation",
      "exercise",
      "question",
      "architecture",
      "mini-project",
    ],
  }).notNull(),
  scope: text("scope", {
    enum: ["focused", "feature", "system"],
  }),
  difficulty: text("difficulty", {
    enum: ["easy", "medium", "hard", "grill"],
  }),
  durationMinMinutes: integer("duration_min_minutes"),
  durationMaxMinutes: integer("duration_max_minutes"),
  implementationMilestones: text("implementation_milestones", {
    mode: "json",
  }).$type<string[]>(),
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
  status: text("status", { enum: ["active", "completed"] })
    .notNull()
    .default("active"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

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
