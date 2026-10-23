"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ScrollText } from "lucide-react";
import { useEffect, useRef } from "react";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { PageIntro } from "@/shared/components/layout/page-intro";
import { AppShell } from "@/shared/components/layout/app-shell";
import { Button } from "@/shared/components/ui/button";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import { getLogs } from "@/features/logs/api/log-api";
import { LogFilterBar } from "@/features/logs/components/log-filters";
import { LogPagination } from "@/features/logs/components/log-pagination";
import { LogStatusBadge } from "@/features/logs/components/log-status";
import {
  formatCost,
  formatLatency,
  formatLogDate,
  formatTokens,
  logHref,
  OPERATION_LABELS,
  readLogFilters,
} from "@/features/logs/lib/log-formatters";

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
    <AppShell
      profile={profile}
      title="Logs"
      contentScrollable={false}
      actions={
        <Button
          aria-label="Refresh logs"
          title="Refresh logs"
          variant="ghost"
          size="icon-sm"
          onClick={() => void logs.refetch()}
          disabled={logs.isFetching}
        >
          <RefreshCw
            size={15}
            className={logs.isFetching ? "animate-spin" : undefined}
          />
        </Button>
      }
    >
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col px-4 py-5 md:px-8 md:py-8">
        <PageIntro
          title="AI activity"
          description="Inspect requests, responses, and timing for your local profile."
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
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line">
              <LogFilterBar
                filters={filters}
                onChange={(next) => router.push(logHref(next))}
              />
              <div
                ref={list}
                className="min-h-0 flex-1 overflow-auto overscroll-contain"
                aria-live="polite"
                aria-busy={logs.isFetching}
              >
                <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-xs">
                  <caption className="sr-only">
                    AI request logs, newest first
                  </caption>
                  <thead className="sticky top-0 z-10 border-b border-line bg-surface/95 text-[11px] text-muted backdrop-blur-sm">
                    <tr>
                      <th scope="col" className="w-[34%] px-3 py-2 font-medium">
                        Request
                      </th>
                      <th scope="col" className="w-[19%] px-3 py-2 font-medium">
                        Model
                      </th>
                      <th
                        scope="col"
                        className="w-[92px] px-3 py-2 font-medium"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="w-[82px] px-3 py-2 text-right font-medium"
                      >
                        Tokens
                      </th>
                      <th
                        scope="col"
                        className="hidden w-[82px] px-3 py-2 text-right font-medium lg:table-cell"
                      >
                        Cost
                      </th>
                      <th
                        scope="col"
                        className="w-[82px] px-3 py-2 text-right font-medium"
                      >
                        Latency
                      </th>
                      <th
                        scope="col"
                        className="hidden w-[138px] px-3 py-2 text-right font-medium xl:table-cell"
                      >
                        Started
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {logs.data.items.map((log) => (
                      <tr key={log.id} className="group hover:bg-elevated/40">
                        <td className="px-3 py-2.5">
                          <Link
                            href={logHref(
                              { ...filters, page: logs.data!.page },
                              log.id,
                            )}
                            className="block min-w-0 rounded-sm outline-offset-4"
                          >
                            <span className="block truncate font-medium group-hover:underline">
                              {OPERATION_LABELS[log.operation]}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted">
                              {log.preview || "No request preview"}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="block truncate"
                            title={log.actualModel ?? log.requestedModel}
                          >
                            {log.actualModel ?? log.requestedModel}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {log.streamed ? "Streamed" : "Structured"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <LogStatusBadge status={log.status} />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                          {formatTokens(log.totalTokens)}
                        </td>
                        <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted lg:table-cell">
                          {formatCost(log.costUsd)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                          {formatLatency(log.durationMs)}
                        </td>
                        <td className="hidden px-3 py-2.5 text-right text-[11px] tabular-nums text-muted xl:table-cell">
                          <time dateTime={log.startedAt}>
                            {formatLogDate(log.startedAt)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logs.data.total === 0 && (
                  <div className="py-12 text-center">
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
            </section>
          )
        )}
      </main>
    </AppShell>
  );
}
