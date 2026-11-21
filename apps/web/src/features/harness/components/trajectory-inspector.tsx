import { useState, type ReactNode } from "react";
import { CircleAlert, LoaderCircle, X } from "lucide-react";
import type { HarnessItem } from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
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
  type TrajectoryPromptSnapshot,
  type TrajectoryRow,
} from "../lib/trajectory";

type TabId =
  "summary" | "prompt" | "input" | "output" | "tools" | "context" | "raw";

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
  if (row.kind === "system")
    return [
      { id: "summary", label: "Summary" },
      { id: "prompt", label: "System Prompt" },
      { id: "tools", label: "Tools" },
      { id: "context", label: "Context" },
      { id: "raw", label: "Raw" },
    ];
  if (row.kind === "context")
    return [
      { id: "summary", label: "Summary" },
      { id: "context", label: "Context" },
      { id: "raw", label: "Raw" },
    ];
  if (row.kind === "tool" || row.kind === "result")
    return [
      { id: "summary", label: "Summary" },
      { id: "input", label: row.isCompletion ? "Result" : "Input" },
      { id: "output", label: "Output" },
      { id: "raw", label: "Raw" },
    ];
  if (row.kind === "request")
    return [
      { id: "summary", label: "Summary" },
      { id: "prompt", label: "Prompt" },
      { id: "output", label: "Response" },
      { id: "raw", label: "Raw" },
    ];
  return [
    { id: "summary", label: "Summary" },
    { id: "input", label: row.kind === "assistant" ? "Content" : "Text" },
    { id: "raw", label: "Raw" },
  ];
}

function defaultTab(row: TrajectoryRow): TabId {
  if (row.kind === "system") return "prompt";
  if (row.kind === "context") return "context";
  if (row.kind === "result") return "input";
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
        "grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-metadata tabular-nums",
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
  const identity: Fact[] = [
    { label: "Status", node: <HarnessStatus status={row.status} label /> },
  ];
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
  details.push(
    { label: "Started", value: formatTime(row.startedAt) },
    { label: "Finished", value: formatTime(row.completedAt) },
    {
      label: "Duration",
      value:
        row.durationMs === null
          ? "—"
          : formatTrajectoryDuration(row.durationMs),
    },
  );
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
    <div className="space-y-2.5">
      <FactList facts={identity} />
      {details.length > 0 && (
        <FactList facts={details} className="border-t border-line/60 pt-2.5" />
      )}
    </div>
  );
}

export function TrajectoryInspector({
  profileId,
  threadId,
  row,
  onClose,
  className,
}: {
  profileId: string;
  threadId: string;
  row: TrajectoryRow;
  onClose: () => void;
  className?: string;
}) {
  const itemId = row.item?.id;
  const full = useHarnessItem(profileId, threadId, itemId, Boolean(itemId));
  const item = full.data ?? row.item;
  const payload = item?.payload ?? {};
  const prompt = promptFrom(item);
  const [tab, setTab] = useState<TabId>(() => defaultTab(row));
  const tabs = tabsFor(row);
  const input =
    row.kind === "tool" || row.kind === "result"
      ? formatTrajectoryValue(payload.input)
      : row.kind === "assistant"
        ? formatTrajectoryValue(payload.content)
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
  // Tool summaries store a compact teaser; the extracted output reads better
  // on the summary tab and copies in full.
  const preview =
    (row.kind === "tool" || row.kind === "result") && output
      ? { label: "Output preview", text: output }
      : row.preview
        ? { label: "Preview", text: row.preview }
        : null;
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-panel",
        className,
      )}
      aria-label="Record inspector"
    >
      <header className="shrink-0 border-b border-line px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-metadata text-muted">
              <span className="font-mono tabular-nums">#{row.ordinal}</span>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-sm px-1.5 text-metadata font-medium",
                  trajectoryTagClass[row.kind],
                )}
              >
                {row.tag}
              </span>
              <span aria-hidden="true">·</span>
              <span>Turn {row.turnOrdinal}</span>
              {row.tool?.isError === true && (
                <HarnessStatus status="failed" label />
              )}
            </p>
            <p
              className="mt-1 truncate text-supporting font-medium text-foreground"
              title={row.summary}
            >
              {row.summary || "Record"}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Close record inspector"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
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
        <div className="scrollbar-quiet shrink-0 overflow-x-auto border-b border-line px-1.5">
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
        <div className="scrollbar-visible min-h-0 flex-1 overflow-y-auto p-3">
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
            {preview && (
              <CodeSection
                label={preview.label}
                text={preview.text}
                maxHeight="max-h-52"
              />
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
            <CodeSection
              label={
                row.kind === "result"
                  ? "Final result"
                  : row.kind === "assistant"
                    ? "Message content"
                    : "Input"
              }
              text={input}
            />
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
            <CodeSection
              label="Run context"
              text={prompt.context ?? ""}
              empty="No context was recorded for this run."
            />
          </TabsContent>
          <TabsContent value="raw" className="mt-0">
            <CodeSection
              label="Raw record"
              text={JSON.stringify(item ?? row, null, 2)}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
