import type { GuidedPreferences } from "@repo/backend/shared/preferences";
import type {
  HarnessAttachmentDirection,
  HarnessAttachmentKind,
  HarnessItemType,
  HarnessThreadStatus,
  HarnessTransport,
  HarnessTurnStatus,
  AgentPermissionMode,
  ProjectCommandResult,
  ProjectFrozenSpecification,
  ProjectPreparationMode,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import type {
  GenerationError,
  GenerationRequest,
} from "../../modules/generations/generation.schema";
import { sql } from "drizzle-orm";
import type {
  QuizAnswers,
  QuizQuestion,
} from "../../modules/quizzes/quiz.schema";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string, _options?: { mode: "date" }) =>
  integer(name, { mode: "timestamp_ms" });
const contextTimestamp = timestamp;
const jsonb = (name: string) => text(name, { mode: "json" });
const boolean = (name: string) => integer(name, { mode: "boolean" });

// The application's only live schema. Retired data lives in schema.legacy.ts
// and is never written by this application again.
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const profilePreferences = sqliteTable("profile_preferences", {
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
    contextSnapshot: jsonb("context_snapshot").$type<Record<string, unknown>>(),
    promptVersion: text("prompt_version"),
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
    completionCriteria: jsonb("completion_criteria")
      .$type<string[]>()
      .notNull(),
    hint: text("hint"),
    workspacePath: text("workspace_path"),
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

// Durable project-preparation attempts. Each challenge may have one active
// attempt at a time; finished attempts stay readable so partial files and their
// reports are never discarded for a later retry.
export const projectPreparations = sqliteTable(
  "project_preparations",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    projectDirectory: text("project_directory").notNull(),
    projectPath: text("project_path").notNull(),
    specification: jsonb("specification")
      .$type<ProjectFrozenSpecification>()
      .notNull(),
    mode: text("mode", { enum: ["start", "retry", "resume", "fresh"] })
      .$type<ProjectPreparationMode>()
      .notNull()
      .default("start"),
    status: text("status", {
      enum: [
        "not_started",
        "running",
        "ready",
        "failed",
        "cancelled",
        "interrupted",
      ],
    })
      .notNull()
      .default("not_started"),
    runToken: text("run_token"),
    // Legacy progress for attempts recorded before harness threads. New runs
    // write harness_items instead; this column stays readable and untouched.
    activity: jsonb("activity")
      .$type<
        import("@repo/backend/shared/contracts").ProjectPreparationActivity[]
      >()
      .notNull()
      .default([]),
    report: jsonb("report").$type<ProjectScaffoldReport>(),
    error:
      jsonb("error").$type<
        import("@repo/backend/shared/contracts").ProjectPreparationError
      >(),
    requestedModel: text("requested_model"),
    startedAt: contextTimestamp("started_at"),
    completedAt: contextTimestamp("completed_at"),
    createdAt: contextTimestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: contextTimestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_preparations_challenge_attempt_unique").on(
      table.challengeId,
      table.attempt,
    ),
    uniqueIndex("project_preparations_active_unique")
      .on(table.challengeId)
      .where(sql`${table.status} in ('not_started', 'running')`),
    index("project_preparations_challenge_updated_idx").on(
      table.challengeId,
      table.updatedAt,
    ),
    check("project_preparations_attempt_positive", sql`${table.attempt} > 0`),
    check(
      "project_preparations_mode_check",
      sql`${table.mode} in ('start', 'retry', 'resume', 'fresh')`,
    ),
    check(
      "project_preparations_status_check",
      sql`${table.status} in ('not_started', 'running', 'ready', 'failed', 'cancelled', 'interrupted')`,
    ),
  ],
);

// Operator-approved scaffold commands. A row is persisted before any command
// can run, and its exact request, attempt, specification hash, and run token
// fence a single atomic claim. Results are the only source of reported check
// outcomes; rejected and stale approvals never start a child process.
export const projectCommandRequests = sqliteTable(
  "project_command_requests",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    preparationId: text("preparation_id")
      .notNull()
      .references(() => projectPreparations.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    specificationHash: text("specification_hash").notNull(),
    runToken: text("run_token").notNull(),
    purpose: text("purpose", {
      enum: ["setup", "check", "run", "inspect"],
    }).notNull(),
    checkId: text("check_id"),
    command: text("command").notNull(),
    cwd: text("cwd").notNull().default("."),
    install: boolean("install").notNull().default(false),
    network: boolean("network").notNull().default(false),
    timeoutMs: integer("timeout_ms").notNull(),
    status: text("status", {
      enum: [
        "pending",
        "approved",
        "running",
        "succeeded",
        "failed",
        "timed_out",
        "cancelled",
        "rejected",
        "interrupted",
      ],
    })
      .notNull()
      .default("pending"),
    authorization: text("authorization", {
      enum: ["individual", "attempt"],
    }),
    result: jsonb("result").$type<ProjectCommandResult>(),
    decidedAt: contextTimestamp("decided_at"),
    startedAt: contextTimestamp("started_at"),
    completedAt: contextTimestamp("completed_at"),
    createdAt: contextTimestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: contextTimestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("project_command_requests_preparation_created_idx").on(
      table.preparationId,
      table.createdAt,
    ),
    index("project_command_requests_preparation_status_idx").on(
      table.preparationId,
      table.status,
    ),
    uniqueIndex("project_command_requests_running_unique")
      .on(table.preparationId, table.command, table.cwd)
      .where(sql`${table.status} = 'running'`),
    check(
      "project_command_requests_attempt_positive",
      sql`${table.attempt} > 0`,
    ),
    check(
      "project_command_requests_timeout_positive",
      sql`${table.timeoutMs} > 0`,
    ),
    check(
      "project_command_requests_purpose_check",
      sql`${table.purpose} in ('setup', 'check', 'run', 'inspect')`,
    ),
    check(
      "project_command_requests_status_check",
      sql`${table.status} in ('pending', 'approved', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'rejected', 'interrupted')`,
    ),
    check(
      "project_command_requests_authorization_check",
      sql`${table.authorization} is null or ${table.authorization} in ('individual', 'attempt')`,
    ),
  ],
);

// Attempt-wide command authorization is explicit about install and network
// disclosures and belongs to exactly one preparation attempt. It is never a
// global permission and a fresh attempt needs its own approval.
export const projectCommandAuthorizations = sqliteTable(
  "project_command_authorizations",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    preparationId: text("preparation_id")
      .notNull()
      .references(() => projectPreparations.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    specificationHash: text("specification_hash").notNull(),
    runToken: text("run_token").notNull(),
    install: boolean("install").notNull().default(false),
    network: boolean("network").notNull().default(false),
    createdAt: contextTimestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: contextTimestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_command_authorizations_preparation_unique").on(
      table.preparationId,
    ),
    check(
      "project_command_authorizations_attempt_positive",
      sql`${table.attempt} > 0`,
    ),
  ],
);

export const quizzes = sqliteTable(
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
    // Allocated from MAX(number) in the same write transaction.
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

// A harness thread is the durable identity of one agent run. Turns capture the
// exact permission mode, model, and transport used, so changing Settings never
// rewrites history.
export const harnessThreads = sqliteTable(
  "harness_threads",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Code registry value such as `chat`, `challenge_generation`, `quiz_generation`. */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    status: text("status")
      .$type<HarnessThreadStatus>()
      .notNull()
      .default("queued"),
    challengeId: text("challenge_id").references(() => challenges.id, {
      onDelete: "set null",
    }),
    parentThreadId: text("parent_thread_id").references(
      (): AnySQLiteColumn => harnessThreads.id,
      { onDelete: "set null" },
    ),
    transport: text("transport").$type<HarnessTransport>().notNull(),
    connectionId: text("connection_id"),
    model: text("model").notNull(),
    reasoningEffort: text("reasoning_effort"),
    runtimeMode: text("runtime_mode")
      .$type<AgentPermissionMode>()
      .notNull()
      .default("approval-required"),
    nativeThreadId: text("native_thread_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: contextTimestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: contextTimestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: contextTimestamp("completed_at"),
  },
  (table) => [
    index("harness_threads_profile_updated_idx").on(
      table.profileId,
      table.updatedAt,
    ),
    index("harness_threads_challenge_updated_idx").on(
      table.challengeId,
      table.updatedAt,
    ),
    index("harness_threads_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "harness_threads_status_check",
      sql`${table.status} in ('queued','running','waiting','completed','failed','cancelled','interrupted')`,
    ),
    check(
      "harness_threads_transport_check",
      sql`${table.transport} in ('api','codex_cli','opencode_cli')`,
    ),
    check(
      "harness_threads_runtime_mode_check",
      sql`${table.runtimeMode} in ('approval-required','auto-accept-edits','auto','full-access')`,
    ),
  ],
);

export const harnessTurns = sqliteTable(
  "harness_turns",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => harnessThreads.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    status: text("status")
      .$type<HarnessTurnStatus>()
      .notNull()
      .default("queued"),
    inputText: text("input_text").notNull(),
    transport: text("transport").$type<HarnessTransport>().notNull(),
    connectionId: text("connection_id"),
    model: text("model").notNull(),
    reasoningEffort: text("reasoning_effort"),
    runtimeMode: text("runtime_mode").$type<AgentPermissionMode>().notNull(),
    nativeTurnId: text("native_turn_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestedAt: contextTimestamp("requested_at")
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: contextTimestamp("started_at"),
    completedAt: contextTimestamp("completed_at"),
  },
  (table) => [
    uniqueIndex("harness_turns_thread_ordinal_unique").on(
      table.threadId,
      table.ordinal,
    ),
    check("harness_turns_ordinal_positive", sql`${table.ordinal} > 0`),
    check(
      "harness_turns_status_check",
      sql`${table.status} in ('queued','running','waiting','completed','failed','cancelled','interrupted')`,
    ),
    check(
      "harness_turns_runtime_mode_check",
      sql`${table.runtimeMode} in ('approval-required','auto-accept-edits','auto','full-access')`,
    ),
  ],
);

export const harnessTurnAttempts = sqliteTable(
  "harness_turn_attempts",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .references(() => harnessTurns.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    status: text("status")
      .$type<HarnessTurnStatus>()
      .notNull()
      .default("running"),
    nativeThreadId: text("native_thread_id"),
    nativeTurnId: text("native_turn_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: contextTimestamp("started_at")
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: contextTimestamp("completed_at"),
  },
  (table) => [
    uniqueIndex("harness_turn_attempts_turn_ordinal_unique").on(
      table.turnId,
      table.ordinal,
    ),
    check("harness_turn_attempts_ordinal_positive", sql`${table.ordinal} > 0`),
    check(
      "harness_turn_attempts_status_check",
      sql`${table.status} in ('queued','running','waiting','completed','failed','cancelled','interrupted')`,
    ),
  ],
);

export const harnessItems = sqliteTable(
  "harness_items",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => harnessThreads.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => harnessTurns.id, {
      onDelete: "cascade",
    }),
    attemptId: text("attempt_id").references(() => harnessTurnAttempts.id, {
      onDelete: "set null",
    }),
    parentItemId: text("parent_item_id").references(
      (): AnySQLiteColumn => harnessItems.id,
      { onDelete: "set null" },
    ),
    ordinal: integer("ordinal").notNull(),
    type: text("type").$type<HarnessItemType>().notNull(),
    status: text("status").notNull(),
    title: text("title"),
    text: text("text"),
    payload: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: contextTimestamp("started_at"),
    completedAt: contextTimestamp("completed_at"),
    createdAt: contextTimestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: contextTimestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("harness_items_thread_ordinal_unique").on(
      table.threadId,
      table.ordinal,
    ),
    index("harness_items_turn_ordinal_idx").on(table.turnId, table.ordinal),
    index("harness_items_thread_type_updated_idx").on(
      table.threadId,
      table.type,
      table.updatedAt,
    ),
    check(
      "harness_items_type_check",
      sql`${table.type} in ('user_message','assistant_message','reasoning','command_execution','file_change','file_read','file_search','web_search','tool_call','user_input_request','approval_request','system_notice','error')`,
    ),
    check(
      "harness_items_status_check",
      sql`${table.status} in ('pending','running','completed','cancelled','failed')`,
    ),
    check("harness_items_ordinal_positive", sql`${table.ordinal} > 0`),
  ],
);

export const harnessAttachments = sqliteTable(
  "harness_attachments",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => harnessThreads.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => harnessTurns.id, {
      onDelete: "set null",
    }),
    itemId: text("item_id").references(() => harnessItems.id, {
      onDelete: "set null",
    }),
    direction: text("direction").$type<HarnessAttachmentDirection>().notNull(),
    kind: text("kind").$type<HarnessAttachmentKind>().notNull(),
    name: text("name").notNull(),
    mime: text("mime"),
    bytes: integer("bytes"),
    sha256: text("sha256"),
    path: text("path"),
    url: text("url"),
    createdAt: contextTimestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("harness_attachments_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    check(
      "harness_attachments_direction_check",
      sql`${table.direction} in ('input','output')`,
    ),
    check(
      "harness_attachments_kind_check",
      sql`${table.kind} in ('image','file','url','diff','report','snapshot')`,
    ),
  ],
);

export const generationJobs = sqliteTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    kind: text("kind", {
      enum: ["challenge", "quiz", "challenge_quiz"],
    }).notNull(),
    challengeId: text("challenge_id").references(() => challenges.id, {
      onDelete: "set null",
    }),
    request: jsonb("request").$type<GenerationRequest>().notNull(),
    status: text("status", {
      enum: [
        "queued",
        "running",
        "needs_input",
        "completed",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("queued"),
    phase: text("phase", {
      enum: ["queued", "preparing", "generating", "completed"],
    })
      .notNull()
      .default("queued"),
    clarification: jsonb("clarification").$type<{
      question: string;
      options: string[];
    }>(),
    error: jsonb("error").$type<GenerationError>(),
    resultId: text("result_id"),
    resultTitle: text("result_title"),
    resultNumber: integer("result_number"),
    skipPreparation: boolean("skip_preparation").notNull().default(false),
    runToken: text("run_token"),
    leaseUntil: contextTimestamp("lease_until"),
    harnessThreadId: text("harness_thread_id").references(
      () => harnessThreads.id,
      { onDelete: "set null" },
    ),
    createdAt: contextTimestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: contextTimestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: contextTimestamp("completed_at"),
    notifiedAt: contextTimestamp("notified_at"),
  },
  (table) => [
    uniqueIndex("generation_jobs_profile_request_unique").on(
      table.profileId,
      table.requestId,
    ),
    index("generation_jobs_queue_idx").on(table.status, table.createdAt),
    index("generation_jobs_profile_created_idx").on(
      table.profileId,
      table.createdAt,
    ),
    check(
      "generation_jobs_status_check",
      sql`${table.status} in ('queued', 'running', 'needs_input', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      "generation_jobs_kind_check",
      sql`${table.kind} in ('challenge', 'quiz', 'challenge_quiz')`,
    ),
  ],
);

export const quizAttempts = sqliteTable(
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
