import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const reasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;
export const providerPresetSchema = z.enum([
  "custom",
  "omniroute",
  "openai",
  "openrouter",
  "opencode-go",
]);
export type ProviderPreset = z.infer<typeof providerPresetSchema>;
export const providerProtocolSchema = z.enum([
  "openai-responses",
  "openai-completions",
  "anthropic-messages",
  "google-generative-ai",
]);
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>;
export const modelCapabilitiesSchema = z.object({
  tools: z.boolean().default(true),
  images: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  /** Optional override for endpoints that do not publish reasoning levels. */
  reasoningEfforts: z.array(reasoningEffortSchema).optional(),
});
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;
export const modelSelectionSchema = z.object({
  providerId: z.string().uuid(),
  model: z.string().trim().min(1).max(160),
  reasoningEffort: reasoningEffortSchema.nullable().optional(),
});
export type ModelSelection = z.infer<typeof modelSelectionSchema>;
export function defaultProviderSettings(channel: string) {
  return channel === "production"
    ? { model: "gpt-6.1-sol", reasoningEffort: "high" as const }
    : { model: "gpt-6-luna", reasoningEffort: "medium" as const };
}
export type ProviderModel = {
  id: string;
  name: string;
  /** Upstream catalog group, such as an OpenCode account provider. */
  providerId?: string;
  providerName?: string;
  reasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
  capabilities?: ModelCapabilities;
  contextWindow?: number;
  maxTokens?: number;
};
export type ModelCatalogConnection = {
  id: string;
  name: string;
  preset: ProviderPreset;
  protocol: ProviderProtocol;
  models: ProviderModel[];
  defaultModel: string;
  defaultReasoningEffort?: ReasoningEffort;
};
export type ModelCatalog = {
  connections: ModelCatalogConnection[];
  activeConnectionId: string | null;
  /** Selection used when an AI action runs without an explicit user choice. */
  defaultSelection: ModelSelection | null;
};
/** Call-time tool facts captured with the system prompt for run inspection. */
export type AgentToolSnapshot = {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
};
export type AgentRunEvent =
  | { type: "run_started"; operation: string }
  | { type: "turn_started"; turn: number }
  | { type: "text_delta"; text: string }
  | {
      type: "prompt_captured";
      at: number;
      systemPrompt: string;
      userText: string;
      context?: string;
      tools: AgentToolSnapshot[];
    }
  | { type: "message_started"; at: number }
  | {
      type: "message_completed";
      message: unknown;
      /** Assistant reasoning text is kept as a separate harness item. */
      reasoning?: string;
    }
  | {
      type: "tool_started";
      toolCallId: string;
      toolName: string;
      args: unknown;
      /** The stored arguments were larger than the local inspection limit. */
      argsTruncated?: boolean;
    }
  | {
      type: "tool_finished";
      toolCallId: string;
      toolName: string;
      isError: boolean;
      durationMs?: number;
      result: unknown;
      /** The stored result was larger than the local inspection limit. */
      resultTruncated?: boolean;
    };
export type ProviderHealth = { ok: boolean; message: string; code?: string };
export const endpointSchema = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }, "Use an HTTP(S) endpoint without credentials, query parameters or fragments.")
  .transform((value) => value.replace(/\/+$/, ""));
export const providerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["openai", "codex", "opencode"]).default("openai"),
  /** API preset. Existing records default to a custom OpenAI-compatible endpoint. */
  preset: providerPresetSchema.default("custom"),
  /** Wire protocol for custom OpenAI-compatible endpoints. */
  protocol: providerProtocolSchema.default("openai-responses"),
  /** Declared capabilities for endpoints that do not publish model metadata. */
  capabilities: modelCapabilitiesSchema.default({
    tools: true,
    images: false,
    reasoning: false,
  }),
  enabled: z.boolean().default(true),
  codexHome: z
    .string()
    .trim()
    .max(4096)
    .refine(
      (v) => !v || v.startsWith("/") || v.startsWith("~/"),
      "Use an absolute path or ~/path.",
    )
    .default(""),
  endpoint: endpointSchema.optional(),
  binaryPath: z
    .string()
    .trim()
    .max(4096)
    .refine((v) => !v || v.startsWith("/"), "Use an absolute executable path.")
    .default(""),
  model: z.string().trim().min(1).max(160),
  reasoningEffort: reasoningEffortSchema.optional(),
});
export type Provider = z.infer<typeof providerSchema>;
export const credentialStorageSchema = z.enum(["keyring", "file"]);
export type CredentialStorage = z.infer<typeof credentialStorageSchema>;
export const providerInputSchema = providerSchema
  .extend({
    apiKey: z
      .string()
      .trim()
      .min(1)
      .max(8192)
      .refine(
        (value) => !/[\r\n]/.test(value),
        "API keys must be a single line.",
      )
      .optional(),
    removeKey: z.boolean().optional(),
    storage: credentialStorageSchema.default("keyring"),
  })
  .refine(
    (v) => !(v.apiKey && v.removeKey),
    "Choose either key replacement or removal.",
  )
  .superRefine((value, context) => {
    const builtInApiEndpoint =
      value.preset === "openrouter" || value.preset === "opencode-go";
    if (value.kind === "openai" && !value.endpoint && !builtInApiEndpoint)
      context.addIssue({
        code: "custom",
        path: ["endpoint"],
        message: "Enter an API endpoint.",
      });
    if (value.kind !== "openai" && (value.apiKey || value.removeKey))
      context.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "Use the CLI provider's sign-in flow.",
      });
    if (
      value.kind === "openai" &&
      value.preset !== "custom" &&
      value.preset !== "omniroute" &&
      value.preset !== "openai" &&
      value.protocol !== "openai-responses" &&
      value.protocol !== "openai-completions" &&
      value.protocol !== "anthropic-messages" &&
      value.protocol !== "google-generative-ai"
    )
      context.addIssue({
        code: "custom",
        path: ["protocol"],
        message: "Choose a supported API protocol.",
      });
  });
export type ProviderInput = z.input<typeof providerInputSchema>;
export type SavedProvider = Provider & {
  hasKey: boolean;
  storage: CredentialStorage;
};
export type ProviderConnection = {
  account?: { type: string; email?: string; plan?: string };
  homePath?: string;
  installed: boolean;
  connected: boolean;
  authenticated: boolean;
  version: string | null;
  binaryPath: string | null;
  message: string;
  code?: string;
  models: ProviderModel[];
  login?: {
    url?: string;
    instructions?: string;
    method?: "auto" | "code";
    providerId?: string;
    methodIndex?: number;
  };
  authMethods?: {
    providerId: string;
    name: string;
    methods: { type: "oauth" | "api"; label: string; index: number }[];
  }[];
};
export const agentPermissionModeSchema = z.enum([
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
]);
export type AgentPermissionMode = z.infer<typeof agentPermissionModeSchema>;
export const runtimeSettingsSchema = z.object({
  codexBin: z
    .string()
    .max(4096)
    .refine((v) => !v || v.startsWith("/"), "Use an absolute path.")
    .default(""),
  codexModel: z.string().max(160).default(""),
  contextTokens: z.number().int().min(1024).max(1000000).default(12000),
  judgeTimeoutMs: z.number().int().min(1000).max(3600000).default(900000),
  /** One app-wide permission mode. Read at the start of each harness turn. */
  agentPermissions: agentPermissionModeSchema.default("approval-required"),
});
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;
export const workspacePreferenceSchema = z.object({
  root: z.string().trim().max(4096).default(""),
});
export type WorkspacePreference = z.infer<typeof workspacePreferenceSchema>;
/** Legal POSIX absolute folder paths, including backslashes in file names. */
export function isSelectableWorkspacePath(value: string) {
  return value.startsWith("/") && value !== "/" && !/[\0\r\n]/.test(value);
}
export type LocalSettings = {
  providerDefaults: ReturnType<typeof defaultProviderSettings>;
  providers: SavedProvider[];
  activeProviderId: string | null;
  /** Model and reasoning effort for AI actions that start without a pick. */
  defaultSelection: ModelSelection | null;
  runtime: RuntimeSettings;
  workspace: { root: string; defaultRoot: string };
  keyring: { available: boolean; message: string };
  migration: { pending: boolean; message: string | null };
};
/**
 * Harness threads are durable runs. They are written directly by the local
 * backend; there is no event-sourced projection. `kind` is a code registry so
 * adding a feature never requires a database migration.
 */
export const harnessTransportSchema = z.enum([
  "api",
  "codex_cli",
  "opencode_cli",
]);
export type HarnessTransport = z.infer<typeof harnessTransportSchema>;
export const harnessThreadStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type HarnessThreadStatus = z.infer<typeof harnessThreadStatusSchema>;
export const harnessTurnStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type HarnessTurnStatus = z.infer<typeof harnessTurnStatusSchema>;
export const harnessItemTypeSchema = z.enum([
  "user_message",
  "assistant_message",
  "reasoning",
  "command_execution",
  "file_change",
  "file_read",
  "file_search",
  "web_search",
  "tool_call",
  "user_input_request",
  "approval_request",
  "system_notice",
  "error",
]);
export type HarnessItemType = z.infer<typeof harnessItemTypeSchema>;
export const harnessItemStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "cancelled",
  "failed",
]);
export type HarnessItemStatus = z.infer<typeof harnessItemStatusSchema>;
export const harnessAttachmentDirectionSchema = z.enum(["input", "output"]);
export type HarnessAttachmentDirection = z.infer<
  typeof harnessAttachmentDirectionSchema
>;
export const harnessAttachmentKindSchema = z.enum([
  "image",
  "file",
  "url",
  "diff",
  "report",
  "snapshot",
]);
export type HarnessAttachmentKind = z.infer<typeof harnessAttachmentKindSchema>;
export const harnessThreadSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  kind: z.string().min(1).max(64),
  title: z.string().min(1).max(500),
  status: harnessThreadStatusSchema,
  challengeId: z.string().uuid().nullable(),
  parentThreadId: z.string().uuid().nullable(),
  transport: harnessTransportSchema,
  connectionId: z.string().uuid().nullable(),
  model: z.string().min(1).max(160),
  reasoningEffort: reasoningEffortSchema.nullable(),
  runtimeMode: agentPermissionModeSchema,
  nativeThreadId: z.string().max(500).nullable(),
  errorCode: z.string().max(160).nullable(),
  errorMessage: z.string().max(4000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type HarnessThread = z.infer<typeof harnessThreadSchema>;
export const harnessTurnSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  ordinal: z.number().int().positive(),
  status: harnessTurnStatusSchema,
  inputText: z.string(),
  transport: harnessTransportSchema,
  connectionId: z.string().uuid().nullable(),
  model: z.string().min(1).max(160),
  reasoningEffort: reasoningEffortSchema.nullable(),
  runtimeMode: agentPermissionModeSchema,
  nativeTurnId: z.string().max(500).nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  errorCode: z.string().max(160).nullable(),
  errorMessage: z.string().max(4000).nullable(),
  requestedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type HarnessTurn = z.infer<typeof harnessTurnSchema>;
export const harnessTurnAttemptSchema = z.object({
  id: z.string().uuid(),
  turnId: z.string().uuid(),
  ordinal: z.number().int().positive(),
  status: harnessTurnStatusSchema,
  nativeThreadId: z.string().max(500).nullable(),
  nativeTurnId: z.string().max(500).nullable(),
  errorCode: z.string().max(160).nullable(),
  errorMessage: z.string().max(4000).nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type HarnessTurnAttempt = z.infer<typeof harnessTurnAttemptSchema>;
export const harnessItemSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  turnId: z.string().uuid().nullable(),
  attemptId: z.string().uuid().nullable(),
  parentItemId: z.string().uuid().nullable(),
  ordinal: z.number().int().positive(),
  type: harnessItemTypeSchema,
  status: harnessItemStatusSchema,
  title: z.string().max(500).nullable(),
  text: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type HarnessItem = z.infer<typeof harnessItemSchema>;
export const harnessAttachmentSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  turnId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  direction: harnessAttachmentDirectionSchema,
  kind: harnessAttachmentKindSchema,
  name: z.string().min(1).max(500),
  mime: z.string().max(200).nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  sha256: z.string().max(128).nullable(),
  path: z.string().max(4096).nullable(),
  url: z.string().max(4096).nullable(),
  createdAt: z.string().datetime(),
});
export type HarnessAttachment = z.infer<typeof harnessAttachmentSchema>;
export const harnessThreadDetailSchema = z.object({
  thread: harnessThreadSchema,
  turns: z.array(
    harnessTurnSchema.extend({
      attempts: z.array(harnessTurnAttemptSchema),
      items: z.array(harnessItemSchema),
    }),
  ),
  attachments: z.array(harnessAttachmentSchema),
});
export type HarnessThreadDetail = z.infer<typeof harnessThreadDetailSchema>;
export const harnessThreadSummarySchema = harnessThreadSchema.extend({
  turnCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
});
export type HarnessThreadSummary = z.infer<typeof harnessThreadSummarySchema>;
export const harnessThreadCreateSchema = z.object({
  kind: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(500),
  challengeId: z.string().uuid().nullable().optional(),
  parentThreadId: z.string().uuid().nullable().optional(),
  transport: harnessTransportSchema,
  connectionId: z.string().uuid().nullable().optional(),
  model: z.string().trim().min(1).max(160),
  reasoningEffort: reasoningEffortSchema.nullable().optional(),
  runtimeMode: agentPermissionModeSchema.optional(),
});
export type HarnessThreadCreate = z.infer<typeof harnessThreadCreateSchema>;
export const harnessTurnCreateSchema = z.object({
  inputText: z.string().min(1).max(32_000),
  /**
   * Permissions are snapshotted when the turn starts. Later Settings changes
   * affect the next turn, never a request that is already waiting.
   */
  runtimeMode: agentPermissionModeSchema.optional(),
  transport: harnessTransportSchema.optional(),
  connectionId: z.string().uuid().nullable().optional(),
  model: z.string().trim().min(1).max(160).optional(),
  reasoningEffort: reasoningEffortSchema.nullable().optional(),
});
export type HarnessTurnCreate = z.infer<typeof harnessTurnCreateSchema>;
export const harnessRequestDecisionSchema = z.object({
  decision: z.enum(["allow", "deny"]),
  answer: z.string().trim().max(4000).optional(),
});
export type HarnessRequestDecision = z.infer<
  typeof harnessRequestDecisionSchema
>;
export const challengeWorkspaceSchema = z.object({
  path: z.string().min(1).max(4096),
  initialized: z.boolean(),
  starterFile: z.string().min(1).max(255).nullable(),
});
export type ChallengeWorkspace = z.infer<typeof challengeWorkspaceSchema>;
export const projectFileEntrySchema = z.object({
  path: z.string().min(1).max(512),
  bytes: z.number().int().nonnegative(),
});
export type ProjectFileEntry = z.infer<typeof projectFileEntrySchema>;
export const projectFilesViewSchema = z.object({
  projectDirectory: z.string().min(1).max(64),
  projectPath: z.string().min(1).max(4096),
  files: z.array(projectFileEntrySchema).max(2_000),
  truncated: z.boolean(),
});
export type ProjectFilesView = z.infer<typeof projectFilesViewSchema>;
export const projectFileContentSchema = z.object({
  path: z.string().min(1).max(512),
  bytes: z.number().int().nonnegative(),
  content: z.string().max(2_100_000).nullable(),
  binary: z.boolean(),
  tooLarge: z.boolean(),
});
export type ProjectFileContent = z.infer<typeof projectFileContentSchema>;
export const projectCommandPurposeSchema = z.enum([
  "setup",
  "check",
  "run",
  "inspect",
]);
export type ProjectCommandPurpose = z.infer<typeof projectCommandPurposeSchema>;
export const projectCommandStatusSchema = z.enum([
  "pending",
  "approved",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
  "rejected",
  "interrupted",
]);
export type ProjectCommandStatus = z.infer<typeof projectCommandStatusSchema>;
export const projectCommandOutcomeStatusSchema = z.enum([
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
  "rejected",
  "spawn_failed",
]);
export type ProjectCommandOutcomeStatus = z.infer<
  typeof projectCommandOutcomeStatusSchema
>;
export const projectCommandResultSchema = z.strictObject({
  status: projectCommandOutcomeStatusSchema,
  started: z.boolean(),
  exitCode: z.number().int().nullable(),
  signal: z.string().max(32).nullable(),
  output: z.string().max(131_072),
  outputBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  timedOut: z.boolean(),
  cancelled: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  error: z
    .object({
      code: z.string().min(1).max(160),
      message: z.string().min(1).max(1_000),
    })
    .nullable(),
});
export type ProjectCommandResult = z.infer<typeof projectCommandResultSchema>;
export const projectCommandSchema = z.object({
  id: z.string().uuid(),
  purpose: projectCommandPurposeSchema,
  checkId: z.string().max(80).nullable(),
  status: projectCommandStatusSchema,
  command: z.string().min(1).max(2_000),
  cwd: z.string().min(1).max(512),
  install: z.boolean(),
  network: z.boolean(),
  timeoutMs: z.number().int().positive().max(120_000),
  authorization: z.enum(["individual", "attempt"]).nullable(),
  result: projectCommandResultSchema.nullable(),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type ProjectCommand = z.infer<typeof projectCommandSchema>;
export const projectCommandAuthorizationSchema = z.object({
  attempt: z.number().int().positive(),
  install: z.boolean(),
  network: z.boolean(),
  approvedAt: z.string().datetime(),
});
export type ProjectCommandAuthorization = z.infer<
  typeof projectCommandAuthorizationSchema
>;
export const projectPreparationStatusSchema = z.enum([
  "not_started",
  "running",
  "ready",
  "failed",
  "cancelled",
  "interrupted",
]);
export type ProjectPreparationStatus = z.infer<
  typeof projectPreparationStatusSchema
>;
export const projectPreparationModeSchema = z.enum([
  "start",
  "retry",
  "resume",
  "fresh",
]);
export type ProjectPreparationMode = z.infer<
  typeof projectPreparationModeSchema
>;
export const projectResumeStatusSchema = z.enum([
  "available",
  "not_applicable",
  "attempts_exhausted",
  "settling",
  "project_missing",
  "journal_missing",
  "journal_invalid",
  "journal_unavailable",
  "file_modified",
  "unavailable",
]);
export type ProjectResumeStatus = z.infer<typeof projectResumeStatusSchema>;
export const projectPreparationRecoverySchema = z.object({
  canRetry: z.boolean(),
  canResume: z.boolean(),
  canFresh: z.boolean(),
  /** A previous run is still stopping; new writers stay disabled. */
  settling: z.boolean(),
  resumeStatus: projectResumeStatusSchema,
  resumeMessage: z.string().max(1_000).nullable(),
  /** First tracked file that conflicts with the generated-file journal. */
  conflictPath: z.string().max(512).nullable(),
  /** Explicitly journaled files missing from disk; a resumed run may recreate them. */
  missingFiles: z.array(z.string().max(512)).max(20),
  missingFileCount: z.number().int().nonnegative(),
});
export type ProjectPreparationRecovery = z.infer<
  typeof projectPreparationRecoverySchema
>;
export const projectPreparationActivityTypeSchema = z.enum([
  "listed",
  "read",
  "searched",
  "created_directory",
  "created_file",
  "edited_file",
  "specification_saved",
  "started",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type ProjectPreparationActivityType = z.infer<
  typeof projectPreparationActivityTypeSchema
>;
export const projectPreparationActivitySchema = z.object({
  type: projectPreparationActivityTypeSchema,
  at: z.string().datetime(),
  path: z.string().max(512).optional(),
  bytes: z.number().int().nonnegative().optional(),
  entries: z.number().int().nonnegative().optional(),
  matches: z.number().int().nonnegative().optional(),
  replacements: z.number().int().nonnegative().optional(),
  truncated: z.boolean().optional(),
  query: z.string().max(300).optional(),
  message: z.string().max(500).optional(),
});
export type ProjectPreparationActivity = z.infer<
  typeof projectPreparationActivitySchema
>;
export const startingPointSchema = z.string().trim().min(1).max(400);

export const projectFrozenSpecificationSchema = z.object({
  version: z.literal(1),
  challengeId: z.string().uuid(),
  profileId: z.string().uuid(),
  challengeNumber: z.number().int().positive(),
  title: z.string().min(1).max(120),
  request: z.string().trim().min(1).max(4_000),
  startingPoint: startingPointSchema.optional(),
  scope: z.enum(["focused", "feature", "system"]),
  difficulty: z.enum(["easy", "medium", "hard", "grill"]),
  problemStatement: z.string().min(1).max(5_000),
  expectedOutcome: z.string().min(1).max(1_000),
  implementationBoundary: z.string().max(1_000).nullable(),
  objectives: z.array(z.string().max(500)).max(20),
  acceptanceCriteria: z.array(z.string().max(500)).min(1).max(20),
  durationEstimate: z.object({
    minMinutes: z.number().int().positive(),
    maxMinutes: z.number().int().positive(),
  }),
  stack: z.object({
    experienceLevel: z.string().max(80).nullable(),
    languages: z.array(z.string().max(80)).max(50),
    stack: z.array(z.string().max(80)).max(50),
    currentFocus: z.string().max(80).nullable(),
  }),
  model: z.object({
    selection: modelSelectionSchema.nullable(),
    label: z.string().max(200),
  }),
  frozenAt: z.string().datetime(),
});
export type ProjectFrozenSpecification = z.infer<
  typeof projectFrozenSpecificationSchema
>;
export const reviewCriterionStatusSchema = z.enum([
  "pass",
  "partial",
  "fail",
  "unable_to_assess",
]);
export type ReviewCriterionStatus = z.infer<typeof reviewCriterionStatusSchema>;
export const reviewCriterionSchema = z.object({
  criterion: z.string().trim().min(1).max(320),
  status: reviewCriterionStatusSchema,
  evidence: z.string().trim().min(1).max(240),
  path: z.string().trim().max(300).nullable().default(null),
  line: z.number().int().positive().nullable().default(null),
});
export type ReviewCriterion = z.infer<typeof reviewCriterionSchema>;
export const reviewFindingSchema = z.object({
  problem: z.string().trim().min(1).max(200),
  fix: z.string().trim().min(1).max(200),
});
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export const challengeReviewVerdictSchema = z.enum([
  "meets",
  "partly_meets",
  "does_not_meet",
]);
export type ChallengeReviewVerdict = z.infer<
  typeof challengeReviewVerdictSchema
>;
/** The model's answer. The verdict and counts are derived, never supplied. */
export const challengeReviewResultSchema = z.object({
  criteria: z.array(reviewCriterionSchema).min(1).max(8),
  strengths: z.array(z.string().trim().min(1).max(200)).max(3).default([]),
  improvements: z.array(reviewFindingSchema).max(3).default([]),
  nextStep: z.string().trim().min(1).max(200),
});
export type ChallengeReviewResult = z.infer<typeof challengeReviewResultSchema>;
export const challengeReviewSchema = z.object({
  reviewNumber: z.number().int().positive().optional(),
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  challengeId: z.string().uuid(),
  verdict: challengeReviewVerdictSchema,
  criteriaMet: z.number().int().min(0),
  criteriaTotal: z.number().int().min(1),
  result: challengeReviewResultSchema,
  model: z.string().max(200),
  threadId: z.string().nullable(),
  createdAt: z.string(),
});
export type ChallengeReview = z.infer<typeof challengeReviewSchema>;

export const projectFileRoleSchema = z.enum([
  "source",
  "config",
  "migration",
  "test",
  "fixture",
  "documentation",
]);
export type ProjectFileRole = z.infer<typeof projectFileRoleSchema>;
export const projectCommandProposalSchema = z.strictObject({
  id: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(200),
  command: z.string().trim().min(1).max(2_000),
  cwd: z.string().trim().max(512).default("."),
  install: z.boolean(),
  network: z.boolean(),
});
export type ProjectCommandProposal = z.infer<
  typeof projectCommandProposalSchema
>;
export const projectCheckIntentSchema = z.enum(["verify", "todo_exercise"]);
export type ProjectCheckIntent = z.infer<typeof projectCheckIntentSchema>;
export const projectCheckExpectationSchema = z.enum(["pass", "fail"]);
export type ProjectCheckExpectation = z.infer<
  typeof projectCheckExpectationSchema
>;
export const projectCheckProposalSchema = z.strictObject({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(["test", "typecheck", "build", "lint", "manual"]),
  command: z.string().trim().min(1).max(2_000).nullable(),
  cwd: z.string().trim().max(512).default("."),
  install: z.boolean(),
  network: z.boolean(),
  intent: projectCheckIntentSchema.default("verify"),
  expected: projectCheckExpectationSchema.default("pass"),
});
export type ProjectCheckProposal = z.infer<typeof projectCheckProposalSchema>;
export const projectCheckResultSchema = z.strictObject({
  checkId: z.string().trim().min(1).max(80),
  status: z.enum(["not_run", "passed", "failed", "blocked"]),
  detail: z.string().trim().max(1_000).nullable().default(null),
});
export type ProjectCheckResult = z.infer<typeof projectCheckResultSchema>;
export const projectScaffoldReportSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2_000),
  files: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(512),
        role: projectFileRoleSchema,
        purpose: z.string().trim().max(300).nullable().default(null),
      }),
    )
    .max(200),
  todos: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(512),
        line: z.number().int().positive(),
        note: z.string().trim().min(1).max(300),
      }),
    )
    .max(200),
  setup: z.array(projectCommandProposalSchema).max(20),
  run: z.array(projectCommandProposalSchema).max(20),
  checks: z.array(projectCheckProposalSchema).max(40),
  results: z.array(projectCheckResultSchema).max(40),
  problems: z.array(z.string().trim().min(1).max(500)).max(20),
  blockingProblems: z
    .array(z.string().trim().min(1).max(500))
    .max(20)
    .describe(
      "Unresolved problems that prevent the intended exercise from starting. Exclude intentional exercise gaps and verification limits that do not prevent starting. Return [] when there are no blockers.",
    )
    .optional(),
});
export type ProjectScaffoldReport = z.infer<typeof projectScaffoldReportSchema>;
export const projectPreparationErrorSchema = z.object({
  code: z.string().min(1).max(160),
  message: z.string().min(1).max(4_000),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ProjectPreparationError = z.infer<
  typeof projectPreparationErrorSchema
>;
export const projectPreparationSchema = z.object({
  id: z.string().uuid().nullable(),
  challengeId: z.string().uuid(),
  attempt: z.number().int().positive().nullable(),
  projectDirectory: z.string().min(1).max(64).nullable(),
  projectPath: z.string().min(1).max(4_096).nullable(),
  mode: projectPreparationModeSchema.nullable(),
  status: projectPreparationStatusSchema,
  specification: projectFrozenSpecificationSchema.nullable(),
  report: projectScaffoldReportSchema.nullable(),
  activity: z.array(projectPreparationActivitySchema).max(200),
  commands: z.array(projectCommandSchema).max(50),
  commandAuthorization: projectCommandAuthorizationSchema.nullable(),
  error: projectPreparationErrorSchema.nullable(),
  requestedModel: z.string().max(200).nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  recovery: projectPreparationRecoverySchema,
  previousAttempt: z
    .object({
      attempt: z.number().int().positive(),
      status: projectPreparationStatusSchema,
      projectDirectory: z.string().min(1).max(64),
      summary: z.string().max(2_000).nullable(),
    })
    .nullable(),
});
export type ProjectPreparation = z.infer<typeof projectPreparationSchema>;
export const workspaceEditorSchema = z.enum([
  "vscode",
  "cursor",
  "zed",
  "vscode-insiders",
  "vscodium",
  "idea",
  "webstorm",
  "pycharm",
  "file-manager",
]);
export type WorkspaceEditor = z.infer<typeof workspaceEditorSchema>;
export type WorkspaceEditorOption = { id: WorkspaceEditor; label: string };
/**
 * Preparation folders are direct children of a validated challenge workspace.
 * The first attempt is `project`; later attempts are `project-2` through
 * `project-99`. This matches `projectAttemptNumber` in the backend workspace
 * module without importing Node-only code into the renderer contract.
 */
export const projectDirectoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) => /^project(?:-(?:[2-9]|[1-9][0-9]))?$/.test(value),
    "Use the preparation project folder directly inside the challenge workspace.",
  );
export type ProjectDirectoryName = z.infer<typeof projectDirectoryNameSchema>;
export const workspaceLaunchSchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(1)
      .max(4096)
      .refine(isSelectableWorkspacePath, "Use an absolute folder path."),
    editor: workspaceEditorSchema,
    challengeId: z.string().uuid(),
    profileId: z.string().uuid(),
    /** Optional prepared project subfolder inside the challenge workspace. */
    projectDirectory: projectDirectoryNameSchema.optional(),
  })
  .strict();
export type WorkspaceLaunch = z.infer<typeof workspaceLaunchSchema>;
export const windowSettingsSchema = z.object({
  startup: z.enum(["maximized", "windowed"]).default("maximized"),
  zoom: z.number().min(0.5).max(2).default(1),
});
export type WindowSettings = z.infer<typeof windowSettingsSchema>;
/** Bounded text for the native clipboard. The desktop main process only writes. */
export const desktopClipboardWriteSchema = z
  .object({
    text: z
      .string()
      .min(1)
      .max(2_000_000)
      .refine((value) => !value.includes("\0"), "Clipboard text is invalid."),
  })
  .strict();
export type DesktopClipboardWrite = z.infer<typeof desktopClipboardWriteSchema>;
export type DesktopState = WindowSettings & {
  fullscreen: boolean;
  maximized: boolean;
  focused: boolean;
};
export type ConnectionBootstrap = { wsUrl: string; ticket: string };
export type DesktopUpdateState = {
  enabled: boolean;
  currentVersion: string;
  authorized: boolean;
  authSource: "owner-cli" | "saved-token" | "session-token" | null;
  email: string | null;
  phase:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "installing"
    | "error";
  latestVersion?: string;
  progress?: number;
  message: string;
};
export const updateCredentialsSchema = z.object({
  email: z.email().max(254),
  token: z
    .string()
    .trim()
    .min(1)
    .max(8192)
    .refine((v) => !/\s/.test(v), "Enter a single-line GitHub token.")
    .optional(),
});
export const setupFolderChoiceSchema = z
  .object({
    dataParent: z.string().max(4096).nullable(),
    workspaceParent: z.string().max(4096).nullable(),
  })
  .strict();
export type SetupFolderChoice = z.infer<typeof setupFolderChoiceSchema>;
export type DesktopSetupState = {
  productName: string;
  channel: "development" | "production";
  platform: "linux" | "darwin";
  iconUrl: string;
  dataFolderName: string;
  workspaceFolderName: string;
  defaultDataRoot: string;
  defaultWorkspaceRoot: string;
  error: string | null;
  saved: { dataRoot: string; workspaceRoot: string } | null;
};
export type DesktopSetupResult = { ok: true } | { ok: false; message: string };
/** The preload bridge used only by the sandboxed first-run setup window. */
export interface DesktopSetupBridge {
  getState(): Promise<DesktopSetupState>;
  chooseFolder(
    target: "data" | "workspace",
    currentParent?: string,
  ): Promise<string | null>;
  complete(choice: SetupFolderChoice): Promise<DesktopSetupResult>;
  retry(): Promise<DesktopSetupResult>;
  cancel(): Promise<void>;
}
export interface DesktopBridge {
  platform: "linux" | "darwin";
  getAppVersion(): Promise<string>;
  getUpdateState(): Promise<DesktopUpdateState>;
  configureUpdates(
    input: z.infer<typeof updateCredentialsSchema>,
  ): Promise<DesktopUpdateState>;
  forgetUpdateToken(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<DesktopUpdateState>;
  downloadUpdate(): Promise<DesktopUpdateState>;
  installUpdate(): Promise<DesktopUpdateState>;
  cancelUpdateDownload(): Promise<DesktopUpdateState>;
  onUpdateState(listener: (state: DesktopUpdateState) => void): () => void;
  minimizeWindow(): Promise<void>;
  toggleMaximize(): Promise<DesktopState>;
  closeWindow(): Promise<void>;
  onWindowState(listener: (state: DesktopState) => void): () => void;
  onOpenSettings(listener: () => void): () => void;
  getConnection(): Promise<ConnectionBootstrap>;
  getWindowState(): Promise<DesktopState>;
  setWindowSettings(input: Partial<WindowSettings>): Promise<DesktopState>;
  zoom(direction: "in" | "out" | "reset"): Promise<DesktopState>;
  toggleFullscreen(): Promise<DesktopState>;
  openDataFolder(): Promise<void>;
  selectProjectsFolder(currentPath?: string): Promise<string | null>;
  selectWorkspaceFolder(currentPath?: string): Promise<string | null>;
  getWorkspaceEditors(): Promise<WorkspaceEditorOption[]>;
  openWorkspaceInEditor(input: WorkspaceLaunch): Promise<void>;
  writeClipboardText(input: DesktopClipboardWrite): Promise<void>;
}
export const apiCallSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(8192)
    .refine(
      (v) =>
        v.startsWith("/") &&
        !v.startsWith("//") &&
        !/[\\#]/.test(v) &&
        !Array.from(v).some((c) => c.charCodeAt(0) < 32) &&
        !v.includes("://"),
    ),
  method: z.enum(["GET", "POST", "DELETE"]).default("GET"),
  body: z.unknown().optional(),
  profileId: z.string().max(128).optional(),
  stream: z.boolean().optional(),
});
export type ApiCall = z.input<typeof apiCallSchema>;
export const clientFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("request"),
    id: z.string().uuid(),
    version: z.literal(PROTOCOL_VERSION),
    call: apiCallSchema,
  }),
  z.object({ type: z.literal("cancel"), id: z.string().uuid() }),
  z.object({ type: z.literal("subscribe") }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientFrame = z.infer<typeof clientFrameSchema>;
export const rpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type RpcError = z.infer<typeof rpcErrorSchema>;
export const serverFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("result"),
    id: z.string().uuid(),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("error"),
    id: z.string().uuid(),
    error: rpcErrorSchema,
  }),
  z.object({
    type: z.literal("delta"),
    id: z.string().uuid(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("changed"),
    revision: z.number().int(),
    tables: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal("pong") }),
]);
export type ServerFrame = z.infer<typeof serverFrameSchema>;
export interface SettingsApi {
  get(): Promise<LocalSettings>;
  saveProvider(input: ProviderInput): Promise<LocalSettings>;
  removeProvider(id: string): Promise<LocalSettings>;
  activateProvider(id: string | null): Promise<LocalSettings>;
  saveDefaultSelection(input: ModelSelection | null): Promise<LocalSettings>;
  saveRuntime(input: RuntimeSettings): Promise<LocalSettings>;
  saveWorkspace(input: WorkspacePreference): Promise<LocalSettings>;
  testProvider(id: string): Promise<ProviderHealth>;
  migrateLegacy(storage: CredentialStorage): Promise<LocalSettings>;
}
