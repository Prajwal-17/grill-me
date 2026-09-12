import type { LogFilters, LogOperation, LogStatus } from "../types";

export const OPERATION_LABELS: Record<LogOperation, string> = {
  preparation: "Request check",
  generation: "Build generation",
  clarify: "Chat",
  review: "Solution review",
  hint: "Hint",
};
export const STATUS_LABELS: Record<LogStatus, string> = {
  running: "Running",
  success: "Passed",
  error: "Failed",
  cancelled: "Interrupted",
};
export function readLogFilters(params: {
  get: (key: string) => string | null;
}): LogFilters {
  const page = Number(params.get("page") ?? 1);
  const status = params.get("status") ?? "all";
  const operation = params.get("operation") ?? "all";
  return {
    page: Number.isInteger(page) && page > 0 && page <= 1_000_000 ? page : 1,
    status: Object.hasOwn(STATUS_LABELS, status)
      ? (status as LogStatus)
      : "all",
    operation: Object.hasOwn(OPERATION_LABELS, operation)
      ? (operation as LogOperation)
      : "all",
    search: (params.get("search") ?? "").slice(0, 200),
  };
}
export function logQuery(filters: LogFilters) {
  const params = new URLSearchParams({ page: String(filters.page) });
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.operation !== "all") params.set("operation", filters.operation);
  if (filters.search) params.set("search", filters.search);
  return params.toString();
}
export function logHref(filters: LogFilters, id?: string) {
  return `/logs${id ? `/${id}` : ""}?${logQuery(filters)}`;
}
export function formatLatency(value: number | null) {
  if (value === null) return "—";
  return value < 1000
    ? `${value} ms`
    : `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} s`;
}
export function formatTokens(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en");
}
export function formatLogDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
export function prettyPayload(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2) ?? "";
}
