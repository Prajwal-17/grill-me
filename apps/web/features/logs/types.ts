export type LogStatus = "running" | "success" | "error" | "cancelled";
export type LogOperation =
  | "preparation"
  | "generation"
  | "clarify"
  | "review"
  | "hint"
  | "quiz_generation";
export type AiLogSummary = {
  id: string;
  profileId: string;
  challengeId: string | null;
  operation: LogOperation;
  status: LogStatus;
  requestedModel: string;
  actualModel: string | null;
  endpoint: string;
  providerRequestId: string | null;
  streamed: boolean;
  preview: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  firstTokenMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
};
export type AiLog = AiLogSummary & {
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown> | null;
  responseText: string;
  streamEvents: unknown[] | null;
  error: Record<string, unknown> | null;
};
export type LogPage = {
  items: AiLogSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
export type LogFilters = {
  page: number;
  status: LogStatus | "all";
  operation: LogOperation | "all";
  search: string;
};
