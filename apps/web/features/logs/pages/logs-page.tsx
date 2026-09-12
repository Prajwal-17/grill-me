"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ScrollText } from "lucide-react";
import { useEffect, useRef } from "react";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppShell } from "../../../shared/components/layout/app-shell";
import { Button } from "../../../shared/components/ui/button";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { getLogs } from "../api/log-api";
import { LogFilterBar } from "../components/log-filters";
import { LogPagination } from "../components/log-pagination";
import { LogStatusBadge } from "../components/log-status";
import {
  formatLatency,
  formatLogDate,
  formatTokens,
  logHref,
  OPERATION_LABELS,
  readLogFilters,
} from "../lib/log-formatters";

export function LogsPage() {
  const profile = useProfile();
  const router = useRouter();
  const filters = readLogFilters(useSearchParams());
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [filters.page, filters.status, filters.operation, filters.search]);
  const logs = useQuery({
    queryKey: ["ai-logs", profile?.id, filters],
    queryFn: () => getLogs(profile!.id, filters),
    enabled: Boolean(profile),
    refetchInterval: filters.page === 1 ? 5000 : false,
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  return (
    <AppShell profile={profile}>
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1280px] flex-col px-5 py-6 md:px-10 md:py-8">
        <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
          <div>
            <h1 className="page-title">Logs</h1>
            <p className="mt-2 text-sm text-muted">
              AI requests, responses, and timing.
            </p>
          </div>
          <Button
            aria-label="Refresh logs"
            onClick={() => void logs.refetch()}
            disabled={logs.isFetching}
          >
            <RefreshCw
              size={15}
              className={logs.isFetching ? "animate-spin" : undefined}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </header>
        <LogFilterBar
          filters={filters}
          onChange={(next) => router.push(logHref(next))}
        />
        {logs.isLoading ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LoadingScreen label="Loading logs…" />
          </div>
        ) : logs.error ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ErrorState
              title="Could not load logs"
              message={logs.error.message}
              onRetry={() => void logs.refetch()}
            />
          </div>
        ) : (
          logs.data && (
            <>
              <div
                ref={list}
                className="my-5 min-h-0 flex-1 overflow-auto overscroll-contain"
                aria-live="polite"
                aria-busy={logs.isFetching}
              >
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <caption className="sr-only">
                    AI request logs, newest first
                  </caption>
                  <thead className="sticky top-0 z-10 border-y border-line bg-surface text-xs text-muted">
                    <tr>
                      <th scope="col" className="py-3 pr-4 font-medium">
                        Request
                      </th>
                      <th
                        scope="col"
                        className="hidden w-[20%] py-3 pr-4 font-medium md:table-cell"
                      >
                        Model
                      </th>
                      <th scope="col" className="w-[108px] py-3 font-medium">
                        Status
                      </th>
                      <th
                        scope="col"
                        className="hidden w-[90px] py-3 text-right font-medium sm:table-cell"
                      >
                        Duration
                      </th>
                      <th
                        scope="col"
                        className="hidden w-[95px] py-3 text-right font-medium lg:table-cell"
                      >
                        Tokens
                      </th>
                      <th
                        scope="col"
                        className="hidden w-[155px] py-3 pl-5 text-right font-medium xl:table-cell"
                      >
                        Started
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {logs.data.items.map((log) => (
                      <tr key={log.id} className="group hover:bg-elevated/35">
                        <td className="py-4 pr-4">
                          <Link
                            href={logHref(
                              { ...filters, page: logs.data!.page },
                              log.id,
                            )}
                            className="block min-w-0 rounded-sm outline-offset-4"
                          >
                            <span className="font-medium group-hover:underline">
                              {OPERATION_LABELS[log.operation]}
                            </span>
                            <span className="mt-1 block truncate text-xs text-muted">
                              {log.preview || "No request preview"}
                            </span>
                            <span className="mt-1 block truncate text-xs text-muted md:hidden">
                              {log.actualModel ?? log.requestedModel} ·{" "}
                              {formatLogDate(log.startedAt)}
                            </span>
                          </Link>
                        </td>
                        <td className="hidden py-4 pr-4 md:table-cell">
                          <span
                            className="block truncate"
                            title={log.actualModel ?? log.requestedModel}
                          >
                            {log.actualModel ?? log.requestedModel}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {log.streamed ? "Streamed" : "Structured"}
                          </span>
                        </td>
                        <td className="py-4">
                          <LogStatusBadge status={log.status} />
                          <span className="mt-1 block text-xs tabular-nums text-muted sm:hidden">
                            {formatLatency(log.durationMs)}
                          </span>
                        </td>
                        <td className="hidden py-4 text-right tabular-nums text-muted sm:table-cell">
                          {formatLatency(log.durationMs)}
                        </td>
                        <td className="hidden py-4 text-right tabular-nums text-muted lg:table-cell">
                          {formatTokens(log.totalTokens)}
                        </td>
                        <td className="hidden py-4 pl-5 text-right text-xs tabular-nums text-muted xl:table-cell">
                          <time dateTime={log.startedAt}>
                            {formatLogDate(log.startedAt)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logs.data.total === 0 && (
                  <div className="py-16 text-center">
                    <ScrollText
                      size={28}
                      strokeWidth={1.25}
                      className="mx-auto mb-4 text-muted"
                    />
                    <h2 className="font-medium">
                      {filters.search ||
                      filters.status !== "all" ||
                      filters.operation !== "all"
                        ? "No matching requests"
                        : "No AI requests yet"}
                    </h2>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                      {filters.search ||
                      filters.status !== "all" ||
                      filters.operation !== "all"
                        ? "Try another search or clear the filters."
                        : "Create a build, ask a question, or request a review. New AI calls will appear here."}
                    </p>
                    {(filters.search ||
                      filters.status !== "all" ||
                      filters.operation !== "all") && (
                      <Button
                        className="mt-4"
                        onClick={() => router.push("/logs")}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <LogPagination data={logs.data} filters={filters} />
            </>
          )
        )}
        <p className="mt-3 shrink-0 text-xs leading-5 text-muted">
          Full payloads are stored locally for this profile. Only new AI
          requests are logged.
        </p>
      </main>
    </AppShell>
  );
}
