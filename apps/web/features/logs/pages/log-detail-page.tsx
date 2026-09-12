"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, CircleAlert } from "lucide-react";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppShell } from "../../../shared/components/layout/app-shell";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { CopyButton } from "../../../shared/components/ui/copy-button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../shared/components/ui/tabs";
import { getLog } from "../api/log-api";
import { LogPayload } from "../components/log-payload";
import { LogStatusBadge } from "../components/log-status";
import {
  formatLatency,
  formatLogDate,
  formatTokens,
  logHref,
  OPERATION_LABELS,
  prettyPayload,
  readLogFilters,
} from "../lib/log-formatters";

export function LogDetailPage({ id }: { id: string }) {
  const profile = useProfile();
  const filters = readLogFilters(useSearchParams());
  const query = useQuery({
    queryKey: ["ai-log", profile?.id, id],
    queryFn: () => getLog(profile!.id, id),
    enabled: Boolean(profile),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 1500 : false,
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  const log = query.data;
  return (
    <AppShell profile={profile}>
      <main className="mx-auto w-full max-w-[1160px] px-5 py-8 md:px-10 md:py-10">
        <Link
          href={logHref(filters)}
          className="mb-7 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to logs
        </Link>
        {query.isLoading ? (
          <LoadingScreen label="Loading request…" />
        ) : query.error ? (
          <ErrorState
            title="Could not load this log"
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          log && (
            <>
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="page-title">
                      {OPERATION_LABELS[log.operation]}
                    </h1>
                    <LogStatusBadge status={log.status} />
                  </div>
                  <p className="mt-3 break-words text-sm leading-6 text-muted">
                    {log.preview}
                  </p>
                </div>
                {log.challengeId && (
                  <Link
                    href={`/chat?id=${log.challengeId}`}
                    className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
                  >
                    Open build
                    <ArrowUpRight size={15} />
                  </Link>
                )}
              </header>
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <time dateTime={log.startedAt}>
                  {formatLogDate(log.startedAt)}
                </time>
                <span className="break-all font-mono">{log.id}</span>
                <CopyButton text={log.id} label="Copy ID" />
              </div>
              <dl className="my-7 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  ["Requested model", log.requestedModel],
                  ["Returned model", log.actualModel ?? "Not reported"],
                  ["Duration", formatLatency(log.durationMs)],
                  ["First token", formatLatency(log.firstTokenMs)],
                  ["Input tokens", formatTokens(log.inputTokens)],
                  ["Output tokens", formatTokens(log.outputTokens)],
                  [
                    "Cached / reasoning",
                    `${formatTokens(log.cachedTokens)} / ${formatTokens(log.reasoningTokens)}`,
                  ],
                  [
                    "Reported cost",
                    log.costUsd === null
                      ? "Not reported"
                      : new Intl.NumberFormat("en", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 6,
                        }).format(log.costUsd),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1.5 break-words text-sm tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              {log.error && (
                <div
                  role="alert"
                  className="mb-6 flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm"
                >
                  <CircleAlert
                    size={17}
                    className="mt-0.5 shrink-0 text-destructive"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-destructive">
                      {String(log.error.code ?? "Request did not complete")}
                    </p>
                    <p className="mt-1 break-words leading-6">
                      {String(
                        log.error.message ?? "No error message was returned.",
                      )}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Any received response and stream events are retained
                      below.
                    </p>
                  </div>
                </div>
              )}
              <Tabs defaultValue="response" className="gap-5">
                <TabsList
                  variant="line"
                  className="w-full justify-start border-b border-line"
                >
                  <TabsTrigger value="response" className="flex-none px-4">
                    Response
                  </TabsTrigger>
                  <TabsTrigger value="request" className="flex-none px-4">
                    Request
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="flex-none px-4">
                    Raw JSON
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="response">
                  <LogPayload
                    title="Model response"
                    text={log.responseText}
                    empty={
                      log.status === "running"
                        ? "The request is running. Its full response will appear when it finishes."
                        : "No response text was received. Check Raw JSON for provider details."
                    }
                  />
                  {log.status !== "success" && log.responseText && (
                    <p className="mt-3 text-xs text-muted">
                      This is partial or invalid output from a request that did
                      not pass.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="request" className="grid gap-5">
                  <LogPayload
                    title="Instructions"
                    text={prettyPayload(log.requestBody.instructions ?? "")}
                  />
                  <LogPayload
                    title="Input"
                    text={prettyPayload(log.requestBody.input ?? "")}
                  />
                </TabsContent>
                <TabsContent value="raw">
                  <LogPayload title="Full log JSON" text={prettyPayload(log)} />
                </TabsContent>
              </Tabs>
              <div className="mt-6 grid gap-2 border-t border-line pt-5 text-xs leading-5 text-muted">
                <p className="break-all">Endpoint: {log.endpoint}</p>
                {log.providerRequestId && (
                  <p className="break-all">
                    Provider ID: {log.providerRequestId}
                  </p>
                )}
                <p>
                  {log.streamed
                    ? "Streamed response. Raw JSON includes the recorded stream events."
                    : "Structured response. Passed means the output satisfied the app’s schema."}{" "}
                  Missing usage or cost means the provider did not report it.
                </p>
              </div>
            </>
          )
        )}
      </main>
    </AppShell>
  );
}
