import { apiRequest } from "@/shared/lib/api-client";
import { logQuery } from "@/features/logs/lib/log-formatters";
import type { AiLog, LogFilters, LogPage } from "@/features/logs/types";
export function getLogs(profileId: string, filters: LogFilters) {
  return apiRequest<LogPage>(`/logs?${logQuery(filters)}`, {}, profileId);
}
export function getLog(profileId: string, id: string) {
  return apiRequest<AiLog>(`/logs/${encodeURIComponent(id)}`, {}, profileId);
}
