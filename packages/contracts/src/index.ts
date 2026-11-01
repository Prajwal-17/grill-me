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
export function defaultProviderSettings(channel: string) {
  return channel === "production"
    ? { model: "gpt-6.1-sol", reasoningEffort: "high" as const }
    : { model: "gpt-6-luna", reasoningEffort: "medium" as const };
}
export type ProviderModel = {
  id: string;
  name: string;
  reasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
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
    storage: z.enum(["keyring", "session"]).default("keyring"),
  })
  .refine(
    (v) => !(v.apiKey && v.removeKey),
    "Choose either key replacement or removal.",
  )
  .superRefine((value, context) => {
    if (value.kind === "openai" && !value.endpoint)
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
  });
export type ProviderInput = z.input<typeof providerInputSchema>;
export type SavedProvider = Provider & {
  hasKey: boolean;
  storage: "keyring" | "session";
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
export type LocalSettings = {
  providerDefaults: ReturnType<typeof defaultProviderSettings>;
  providers: SavedProvider[];
  activeProviderId: string | null;
  runtime: RuntimeSettings;
  keyring: { available: boolean; message: string };
  migration: { pending: boolean; message: string | null };
};
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
  testProvider(id: string): Promise<ProviderHealth>;
  migrateLegacy(storage: "keyring" | "session"): Promise<LocalSettings>;
}
