import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import type { HarnessItem } from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { Markdown } from "@/shared/components/markdown";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { InfoHint } from "@/shared/components/ui/info-hint";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/cn";
import { useHarnessItem } from "../hooks/use-harness";
import { HarnessStatus } from "./harness-transcript";
import {
  CodeSection,
  ToolCatalog,
  trajectoryTagClass,
} from "./trajectory-parts";
import {
  formatTrajectoryDuration,
  formatTrajectoryValue,
  trajectoryToolOutput,
  trajectoryContextSections,
  type TrajectoryPromptSnapshot,
  type TrajectoryRequest,
  type TrajectoryRow,
} from "../lib/trajectory";

type TabId =
  | "summary"
  | "prompt"
  | "input"
  | "reply"
  | "output"
  | "tools"
  | "context"
  | "usage"
  | "raw";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatTime(value: number | null) {
  return value === null ? "—" : timeFormat.format(new Date(value));
}

function tabsFor(row: TrajectoryRow): { id: TabId; label: string }[] {
  if (row.kind === "model_request")
    return [
      { id: "summary", label: "Summary" },
      { id: "input", label: "Input" },
      { id: "reply", label: "Reply" },
      { id: "usage", label: "Usage" },
      { id: "raw", label: "Stored" },
    ];
  if (row.kind === "system")
    return [
      { id: "summary", label: "Summary" },
      { id: "prompt", label: "System Prompt" },
      { id: "tools", label: "Tools" },
      { id: "context", label: "Context" },
      { id: "raw", label: "Stored" },
    ];
  if (row.kind === "context")
    return [
      { id: "summary", label: "Summary" },
      { id: "context", label: "Context" },
      { id: "raw", label: "Stored" },
    ];
  if (row.kind === "tool" || row.kind === "result")
    return [
      { id: "summary", label: "Summary" },
      { id: "input", label: row.isCompletion ? "Result" : "Input" },
      { id: "output", label: "Output" },
      { id: "raw", label: "Stored" },
    ];
  if (row.kind === "request")
    return [
      { id: "summary", label: "Summary" },
      { id: "prompt", label: "Prompt" },
      { id: "output", label: "Response" },
      { id: "raw", label: "Stored" },
    ];
  return [
    { id: "summary", label: "Summary" },
    { id: "input", label: row.kind === "assistant" ? "Reply" : "Message" },
    { id: "raw", label: "Stored" },
  ];
}

function defaultTab(row: TrajectoryRow): TabId {
  if (row.kind === "system") return "prompt";
  if (row.kind === "context") return "context";
  if (row.kind === "result") return "input";
  if (row.kind === "tool" && row.preview) return "output";
  if (row.kind === "request") return "prompt";
  if (
    row.kind === "user" ||
    row.kind === "assistant" ||
    row.kind === "reasoning"
  )
    return "input";
  return "summary";
}

function promptFrom(item: HarnessItem | undefined): TrajectoryPromptSnapshot {
  if (!item) return {};
  const payload = item.payload;
  return {
    systemPrompt:
      typeof payload.systemPrompt === "string"
        ? payload.systemPrompt
        : undefined,
    context: typeof payload.context === "string" ? payload.context : undefined,
    tools: Array.isArray(payload.tools)
      ? (payload.tools.filter(
          (
            tool,
          ): tool is NonNullable<TrajectoryPromptSnapshot["tools"]>[number] =>
            Boolean(tool) &&
            typeof tool === "object" &&
            typeof (tool as { name?: unknown }).name === "string",
        ) as NonNullable<TrajectoryPromptSnapshot["tools"]>)
      : undefined,
  };
}

/** Raw JSON for a model request: its metadata plus the stored reply. */
function requestRawText(request: TrajectoryRequest) {
  const iso = (value: number | null) =>
    value === null ? null : new Date(value).toISOString();
  const meta = {
    kind: "model_request",
    request: request.ordinal,
    status: request.status,
    model: request.model,
    provider: request.provider,
    stopReason: request.stopReason,
    sentAt: iso(request.sentAt),
    completedAt: iso(request.completedAt),
    durationMs: request.durationMs,
    usage: request.tokens,
    runUsageSoFar: request.cumulativeTokens,
    inputs: request.inputRows.map((row) => ({
      id: row.id,
      type: row.tag,
      summary: row.summary,
    })),
  };
  const response = request.assistantRow?.item;
  return JSON.stringify(
    response ? { request: meta, response } : { request: meta },
    null,
    2,
  );
}

type Fact = {
  label: string;
  value?: string;
  node?: ReactNode;
  mono?: boolean;
  destructive?: boolean;
};

function FactList({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[100px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3 text-supporting tabular-nums",
        className,
      )}
    >
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="text-muted">{fact.label}</dt>
          <dd
            className={cn(
              "min-w-0 break-words text-supporting text-foreground",
              fact.mono && "font-mono",
              fact.destructive && "text-destructive",
            )}
          >
            {fact.node ?? fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Facts({
  row,
  item,
}: {
  row: TrajectoryRow;
  item: HarnessItem | undefined;
}) {
  const payload = item?.payload ?? {};
  const usage = row.tokens;
  const identity: Fact[] = [];
  if (row.attemptOrdinal !== null)
    identity.push({ label: "Attempt", value: String(row.attemptOrdinal) });
  const details: Fact[] = [];
  if (row.tool)
    details.push({
      label: "Tool",
      value:
        row.tool.exitCode === null
          ? row.tool.name
          : `${row.tool.name} · exit\u00A0${row.tool.exitCode}`,
      mono: true,
      destructive: row.tool.isError,
    });
  if (row.request)
    details.push({
      label: "Inputs",
      value: `${row.request.inputRows.length} record${row.request.inputRows.length === 1 ? "" : "s"} fed into this request`,
    });
  details.push(
    {
      label: row.request ? "Sent" : "Started",
      value: formatTime(row.startedAt),
    },
    { label: "Finished", value: formatTime(row.completedAt) },
  );
  if (row.durationMs !== null)
    details.push({
      label: "Duration",
      value: formatTrajectoryDuration(row.durationMs),
    });
  if (usage)
    details.push({
      label: "Tokens",
      value: `${usage.input.toLocaleString()} in · ${usage.output.toLocaleString()} out · ${usage.total.toLocaleString()} total`,
    });
  if (usage && (usage.cacheRead || usage.cacheWrite))
    details.push({
      label: "Cache",
      value: `${usage.cacheRead.toLocaleString()} read · ${usage.cacheWrite.toLocaleString()} written`,
    });
  const model = item?.payload.model;
  if (typeof model === "string")
    details.push({ label: "Model", value: model, mono: true });
  const provider = item?.payload.provider;
  if (typeof provider === "string")
    details.push({ label: "Provider", value: provider, mono: true });
  const stopReason = item?.payload.stopReason;
  if (typeof stopReason === "string")
    details.push({ label: "Stop reason", value: stopReason });
  if (typeof payload.status === "string" && payload.status !== "completed")
    details.push({
      label: "Outcome",
      value: payload.status,
      destructive: payload.status === "failed",
    });
  if (row.decision) details.push({ label: "Decision", value: row.decision });
  if (row.tool?.truncated)
    details.push({
      label: "Stored",
      value: "The stored record was truncated at the local limit.",
    });
  return (
    <div className="max-w-2xl space-y-4">
      {identity.length > 0 && <FactList facts={identity} />}
      {details.length > 0 && (
        <FactList
          facts={details}
          className={
            identity.length > 0 ? "border-t border-line/60 pt-4" : undefined
          }
        />
      )}
    </div>
  );
}

function RunContext({ text }: { text: string }) {
  const sections = trajectoryContextSections(text);
  if (!sections.length)
    return (
      <CodeSection
        label="Run context"
        text={text}
        empty="No context was recorded for this run."
      />
    );
  return (
    <div className="max-w-[75ch] space-y-5">
      {sections.map((section, index) => (
        <section
          key={index}
          className="space-y-2 border-b border-line pb-5 last:border-b-0"
        >
          <div className="flex min-h-8 items-center justify-between gap-2">
            <h3 className="text-ui font-semibold capitalize">
              {section.name.replace(/[_-]/g, " ")}
            </h3>
            {index === 0 && (
              <CopyButton
                text={text}
                label="Copy context"
                ariaLabel="Copy run context"
                iconOnly
              />
            )}
          </div>
          <div className="text-ui leading-relaxed [&_.markdown_:is(h1,h2,h3,h4,h5,h6)]:mt-4 [&_.markdown_:is(h1,h2,h3,h4,h5,h6)]:text-ui [&_.markdown_:is(h1,h2,h3,h4,h5,h6):first-child]:mt-0">
            <Markdown>
              {section.text
                .replace(
                  /\r?\n(?=(?:Title|Task|Implementation boundary|Expected outcome|Acceptance Criteria):)/g,
                  "\n\n",
                )
                .replace(/^Task: (#{1,6} )/gm, "\n$1")
                .replace(
                  /^(Task|Implementation boundary|Expected outcome): (#{1,6} |[-*] |\d+\. )/gm,
                  "\n**$1**\n\n$2",
                )}
            </Markdown>
          </div>
        </section>
      ))}
    </div>
  );
}

export function TrajectoryInspector({
  profileId,
  threadId,
  row,
  onBack,
  onOpenRecord,
  focusOnOpen,
  expanded,
  onToggleExpanded,
}: {
  profileId: string;
  threadId: string;
  row: TrajectoryRow;
  onBack: () => void;
  onOpenRecord: (id: string) => void;
  focusOnOpen: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const itemId = row.item?.id;
  const full = useHarnessItem(profileId, threadId, itemId, Boolean(itemId));
  const item = full.data ?? row.item;
  const payload = item?.payload ?? {};
  const prompt = promptFrom(item);
  const [tab, setTab] = useState<TabId>(() => defaultTab(row));
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusOnOpen) back.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  const tabs = tabsFor(row);
  const input =
    row.kind === "tool" || row.kind === "result"
      ? formatTrajectoryValue(payload.input)
      : row.kind === "assistant"
        ? item?.text?.trim() || formatTrajectoryValue(payload.content)
        : row.kind === "request"
          ? typeof payload.prompt === "string"
            ? payload.prompt
            : (row.item?.text ?? "")
          : (row.item?.text ?? "");
  const output =
    row.kind === "tool"
      ? trajectoryToolOutput(payload)
      : row.kind === "result"
        ? trajectoryToolOutput(payload)
        : row.kind === "request"
          ? [
              typeof payload.decision === "string"
                ? `Decision: ${payload.decision}`
                : "",
              typeof payload.answer === "string" ? payload.answer : "",
            ]
              .filter(Boolean)
              .join("\n\n")
          : (row.item?.text ?? "");
  const replyRow = row.request?.assistantRow;
  const replyText = replyRow
    ? replyRow.item?.text?.trim() ||
      formatTrajectoryValue(replyRow.item?.payload.content)
    : "";
  return (
    <section
      aria-label="Record detail"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel"
      onKeyDown={(event) => {
        if (
          event.key !== "Escape" ||
          event.defaultPrevented ||
          !(event.target instanceof Node) ||
          !event.currentTarget.contains(event.target)
        )
          return;
        event.stopPropagation();
        if (expanded) onToggleExpanded();
        else onBack();
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-5 pt-4 pb-2">
        <h2 className="min-w-0 flex-1 text-ui font-semibold [overflow-wrap:anywhere]">
          {row.kind === "user"
            ? "User message"
            : row.kind === "assistant"
              ? "Model reply"
              : row.kind === "reasoning"
                ? "Reasoning"
                : row.summary || "Record"}
        </h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={expanded ? "Restore inspector" : "Expand inspector"}
          title={expanded ? "Restore inspector" : "Expand inspector"}
          onClick={onToggleExpanded}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </Button>
        <Button
          ref={back}
          size="icon-sm"
          variant="ghost"
          aria-label="Close record detail"
          title="Close record detail"
          onClick={onBack}
        >
          <X size={15} aria-hidden="true" />
        </Button>
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-metadata text-muted">
          <span className="capitalize">{row.tag.toLowerCase()}</span>
          <span>
            Turn {row.turnOrdinal} · Record {row.ordinal}
          </span>
          <HarnessStatus
            status={row.tool?.isError ? "failed" : row.status}
            label
          />
        </div>
        {Boolean(itemId) && full.isPending && (
          <p
            role="status"
            className="mt-1 flex items-center gap-1.5 text-metadata text-muted"
          >
            <LoaderCircle
              size={12}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Loading the full record…
          </p>
        )}
        {full.error && (
          <p className="mt-1 flex items-start gap-1.5 text-metadata text-destructive">
            <CircleAlert
              size={12}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            Showing the abbreviated record. {full.error.message}
          </p>
        )}
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabId)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="scrollbar-quiet shrink-0 overflow-x-auto border-b border-line px-3">
          <TabsList
            variant="line"
            aria-label="Record detail"
            className="h-9 min-w-max justify-start"
          >
            {tabs.map((entry) => (
              <TabsTrigger
                key={entry.id}
                value={entry.id}
                className="flex-none px-2 text-metadata"
              >
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="scrollbar-quiet min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pt-5 pb-6 sm:px-6">
          <TabsContent value="summary" className="mt-0 space-y-3">
            <Facts row={row} item={item} />
            {row.error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-metadata text-destructive"
              >
                {row.error}
              </p>
            )}
            {row.request?.status === "running" && (
              <p className="rounded-md border border-line bg-canvas/40 px-2.5 py-2 text-metadata text-muted">
                The request is in flight; the reply has not been recorded yet.
              </p>
            )}
          </TabsContent>
          <TabsContent value="prompt" className="mt-0">
            <CodeSection
              label={row.kind === "system" ? "System prompt" : "Prompt"}
              text={prompt.systemPrompt ?? input}
              empty="No prompt was recorded."
            />
          </TabsContent>
          <TabsContent value="input" className="mt-0">
            {row.request ? (
              row.request.inputRows.length ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <InfoHint text="The records whose content was sent to the model in this request." />
                    <span className="text-metadata text-muted">
                      What went to the model
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {row.request.inputRows.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => onOpenRecord(entry.id)}
                          className="flex min-h-10 w-full min-w-0 items-center gap-3 rounded-md p-2 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                        >
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-metadata",
                              trajectoryTagClass[entry.kind],
                            )}
                          >
                            {entry.tag}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-supporting">
                            {entry.summary}
                          </span>
                          <ChevronRight
                            size={14}
                            className="shrink-0 text-muted"
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-supporting text-muted">
                  No input records were captured for this request.
                </p>
              )
            ) : (
              <div
                className={cn(
                  (row.kind === "tool" || row.kind === "result") && "space-y-2",
                )}
              >
                {(row.kind === "tool" || row.kind === "result") && (
                  <div className="flex items-center gap-1.5">
                    <InfoHint text="The arguments the model sent to the tool." />
                    <span className="text-metadata text-muted">
                      Tool arguments
                    </span>
                  </div>
                )}
                <CodeSection
                  label={
                    row.kind === "result"
                      ? "Final result"
                      : row.kind === "assistant"
                        ? "Model reply"
                        : "Input"
                  }
                  text={input}
                />
              </div>
            )}
          </TabsContent>
          <TabsContent value="reply" className="mt-0">
            <CodeSection
              label="Model reply"
              text={replyText}
              empty={
                row.request?.status === "running"
                  ? "The reply has not been recorded yet; the request is in flight."
                  : "No reply was recorded for this request."
              }
            />
          </TabsContent>
          <TabsContent value="usage" className="mt-0 space-y-3">
            <div className="flex items-center gap-1.5">
              <InfoHint text="Token counts the provider reported for this request's reply." />
              <span className="text-metadata text-muted">
                Provider-reported
              </span>
            </div>
            {row.tokens ? (
              <FactList
                facts={[
                  {
                    label: "Input",
                    value: `${row.tokens.input.toLocaleString()} tok`,
                  },
                  {
                    label: "Output",
                    value: `${row.tokens.output.toLocaleString()} tok`,
                  },
                  {
                    label: "Total",
                    value: row.tokens.total.toLocaleString(),
                  },
                  ...(row.tokens.cacheRead || row.tokens.cacheWrite
                    ? [
                        {
                          label: "Cache",
                          value: `${row.tokens.cacheRead.toLocaleString()} read · ${row.tokens.cacheWrite.toLocaleString()} written`,
                        },
                      ]
                    : []),
                  ...(row.request?.cumulativeTokens
                    ? [
                        {
                          label: "Run so far",
                          value: `${row.request.cumulativeTokens.total.toLocaleString()} tok across ${row.request.ordinal} request${row.request.ordinal === 1 ? "" : "s"}`,
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <p className="text-supporting text-muted">
                No token usage was recorded for this request.
              </p>
            )}
          </TabsContent>
          <TabsContent value="output" className="mt-0">
            <CodeSection
              label={row.kind === "request" ? "Response" : "Output"}
              text={output}
            />
          </TabsContent>
          <TabsContent value="tools" className="mt-0">
            <ToolCatalog tools={prompt.tools ?? []} />
          </TabsContent>
          <TabsContent value="context" className="mt-0">
            <RunContext text={prompt.context ?? ""} />
          </TabsContent>
          <TabsContent value="raw" className="mt-0 space-y-2">
            <div className="flex items-center gap-1.5">
              <InfoHint
                text={
                  row.request
                    ? "This request's metadata plus the stored reply record — not the HTTP request body sent to the provider."
                    : "The record exactly as stored in the local database — not the HTTP request body sent to the provider."
                }
              />
              <span className="text-metadata text-muted">Stored record</span>
            </div>
            <CodeSection
              label="Stored record"
              text={
                row.request
                  ? requestRawText(row.request)
                  : JSON.stringify(item ?? row, null, 2)
              }
            />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
