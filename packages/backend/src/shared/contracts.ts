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
};
export type AgentRunEvent =
  | { type: "run_started"; operation: string }
  | { type: "turn_started"; turn: number }
  | { type: "text_delta"; text: string }
  | { type: "message_completed"; message: unknown }
  | {
      type: "tool_started";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_finished";
      toolCallId: string;
      toolName: string;
      isError: boolean;
      durationMs?: number;
      result: unknown;
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
export const runtimeSettingsSchema = z.object({
  codexBin: z
    .string()
    .max(4096)
    .refine((v) => !v || v.startsWith("/"), "Use an absolute path.")
    .default(""),
  codexModel: z.string().max(160).default(""),
  contextTokens: z.number().int().min(1024).max(1000000).default(12000),
  judgeTimeoutMs: z.number().int().min(1000).max(3600000).default(900000),
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
  runtime: RuntimeSettings;
  workspace: { root: string; defaultRoot: string };
  keyring: { available: boolean; message: string };
  migration: { pending: boolean; message: string | null };
};
export const challengeWorkspaceSchema = z.object({
  path: z.string().min(1).max(4096),
  initialized: z.boolean(),
  starterFile: z.string().min(1).max(255).nullable(),
});
export type ChallengeWorkspace = z.infer<typeof challengeWorkspaceSchema>;
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
  })
  .strict();
export type WorkspaceLaunch = z.infer<typeof workspaceLaunchSchema>;
export const windowSettingsSchema = z.object({
  startup: z.enum(["maximized", "windowed"]).default("maximized"),
  zoom: z.number().min(0.5).max(2).default(1),
});
export type WindowSettings = z.infer<typeof windowSettingsSchema>;
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
  saveRuntime(input: RuntimeSettings): Promise<LocalSettings>;
  saveWorkspace(input: WorkspacePreference): Promise<LocalSettings>;
  testProvider(id: string): Promise<ProviderHealth>;
  migrateLegacy(storage: CredentialStorage): Promise<LocalSettings>;
}
