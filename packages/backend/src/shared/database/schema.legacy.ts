import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Retired tables. Migration v8 renames the previous feature tables to
 * `*_legacy` and v10 renames `messages`. They are kept so existing practice
 * data stays readable, but this application never writes to them again.
 *
 * This module only describes shapes for read-only queries. Do not add service
 * functions, mutations, or foreign-key references back into live tables.
 */
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const jsonb = (name: string) => text(name, { mode: "json" });
const boolean = (name: string) => integer(name, { mode: "boolean" });

export const projectsLegacy = sqliteTable("projects_legacy", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  name: text("name").notNull(),
  root: text("root").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const submissionsLegacy = sqliteTable("submissions_legacy", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id").notNull(),
  sequence: integer("sequence").notNull(),
  contractVersion: integer("contract_version").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments").$type<unknown>().notNull(),
  projectId: text("project_id"),
  snapshotPath: text("snapshot_path").notNull(),
  manifest: jsonb("manifest").$type<unknown>().notNull(),
  gitContext: jsonb("git_context").$type<unknown>(),
  assistance: jsonb("assistance").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const reviewJobsLegacy = sqliteTable("review_jobs_legacy", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull(),
  judge: text("judge").notNull(),
  modelSelection: jsonb("model_selection").$type<unknown>(),
  routingReason: text("routing_reason").notNull(),
  status: text("status").notNull(),
  progress: text("progress").notNull(),
  response: jsonb("response").$type<unknown>(),
  score: integer("score"),
  error: text("error"),
  followup: text("followup"),
  aiLogId: text("ai_log_id"),
  providerThreadId: text("provider_thread_id"),
  providerTurnId: text("provider_turn_id"),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at").notNull(),
  completedAt: timestamp("completed_at"),
});

export const verificationRunsLegacy = sqliteTable("verification_runs_legacy", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull(),
  evidence: jsonb("evidence").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const aiLogsLegacy = sqliteTable("ai_logs_legacy", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  challengeId: text("challenge_id"),
  operation: text("operation").notNull(),
  status: text("status").notNull(),
  requestedModel: text("requested_model").notNull(),
  actualModel: text("actual_model"),
  endpoint: text("endpoint").notNull(),
  providerRequestId: text("provider_request_id"),
  streamed: boolean("streamed").notNull(),
  preview: text("preview").notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  firstTokenMs: integer("first_token_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  cachedTokens: integer("cached_tokens"),
  reasoningTokens: integer("reasoning_tokens"),
  costUsd: real("cost_usd"),
  requestBody: jsonb("request_body").$type<unknown>().notNull(),
  responseBody: jsonb("response_body").$type<unknown>(),
  responseText: text("response_text").notNull(),
  streamEvents: jsonb("stream_events").$type<unknown>(),
  error: jsonb("error").$type<unknown>(),
});

export const aiLogEventsLegacy = sqliteTable("ai_log_events_legacy", {
  id: integer("id").primaryKey(),
  logId: text("log_id").notNull(),
  recordedAt: timestamp("recorded_at").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
});

export const agentRunsLegacy = sqliteTable("agent_runs_legacy", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  operation: text("operation").notNull(),
  challengeId: text("challenge_id"),
  resourceKind: text("resource_kind"),
  resourceId: text("resource_id"),
  providerId: text("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  providerPreset: text("provider_preset").notNull(),
  model: text("model").notNull(),
  reasoningEffort: text("reasoning_effort"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  turnCount: integer("turn_count").notNull(),
  toolCallCount: integer("tool_call_count").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
});

export const agentRunEventsLegacy = sqliteTable("agent_run_events_legacy", {
  id: integer("id").primaryKey(),
  runId: text("run_id").notNull(),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const generationCountersLegacy = sqliteTable(
  "generation_counters_legacy",
  {
    profileId: text("profile_id").notNull(),
    kind: text("kind").notNull(),
    value: integer("value").notNull(),
  },
);

export const messagesLegacy = sqliteTable("messages_legacy", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id").notNull(),
  role: text("role").notNull(),
  mode: text("mode").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  replyTo: text("reply_to"),
  attachments: jsonb("attachments").$type<unknown>().notNull(),
  createdAt: timestamp("created_at").notNull(),
});
