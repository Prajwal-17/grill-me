import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  FileCode2,
  FileSearch,
  LoaderCircle,
  Search,
  ShieldQuestion,
  Square,
  Terminal,
} from "lucide-react";
import type {
  HarnessItem,
  HarnessItemType,
  HarnessThreadDetail,
} from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { Markdown } from "@/shared/components/markdown";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/cn";
import {
  useHarnessDecision,
  useHarnessThread,
  useHarnessThreads,
  useRetryHarnessThread,
  useStopHarnessThread,
} from "../hooks/use-harness";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : null;
}

const toolIcons: Partial<Record<HarnessItemType, typeof Terminal>> = {
  command_execution: Terminal,
  file_change: FileCode2,
  file_read: FileCode2,
  file_search: FileSearch,
  web_search: Search,
  tool_call: Square,
};

function StatusDot({ status }: { status: string }) {
  if (status === "running")
    return (
      <LoaderCircle
        size={13}
        aria-label="Running"
        className="animate-spin text-warning motion-reduce:animate-none"
      />
    );
  if (status === "completed")
    return (
      <CheckCircle2 size={13} aria-label="Completed" className="text-success" />
    );
  if (status === "failed")
    return (
      <CircleAlert size={13} aria-label="Failed" className="text-destructive" />
    );
  if (status === "cancelled")
    return <Square size={12} aria-label="Cancelled" className="text-muted" />;
  return <CircleHelp size={13} aria-label={status} className="text-muted" />;
}

function toolSummary(item: HarnessItem) {
  const payload = item.payload;
  if (item.type === "command_execution")
    return (
      stringValue(payload.input ?? payload.command) || item.title || "Command"
    );
  if (
    item.type === "file_change" ||
    item.type === "file_read" ||
    item.type === "file_search"
  )
    return (
      stringValue(payload.path) ||
      stringValue(
        (payload.input as Record<string, unknown> | undefined)?.path,
      ) ||
      item.title ||
      "File"
    );
  return item.title ?? item.type.replaceAll("_", " ");
}

function ToolItem({ item }: { item: HarnessItem }) {
  const Icon = toolIcons[item.type] ?? Square;
  const output = stringValue(item.payload.output);
  const input = item.payload.input;
  const exitCode = numberValue(item.payload.exitCode);
  return (
    <li className="py-1.5">
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-sm text-metadata text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
          <Icon size={13} className="shrink-0" aria-hidden="true" />
          <span className="break-all text-foreground">{toolSummary(item)}</span>
          {exitCode !== null && <span>exit {exitCode}</span>}
          <StatusDot status={item.status} />
        </summary>
        <div className="ml-6 mt-1 space-y-1.5">
          {input !== undefined && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas px-2 py-1.5 font-mono text-code">
              {typeof input === "string"
                ? input
                : JSON.stringify(input, null, 2)}
            </pre>
          )}
          {output && (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas px-2 py-1.5 font-mono text-code text-muted">
              {output}
            </pre>
          )}
        </div>
      </details>
    </li>
  );
}

function RequestItem({
  item,
  profileId,
  threadId,
}: {
  item: HarnessItem;
  profileId: string;
  threadId: string;
}) {
  const decide = useHarnessDecision(profileId, threadId);
  const [answer, setAnswer] = useState("");
  const payload = item.payload;
  const prompt = stringValue(payload.prompt) || item.text || "";
  const requestId = stringValue(payload.requestId);
  const options = Array.isArray(payload.options)
    ? payload.options.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const pending = item.status === "pending";
  const isQuestion = item.type === "user_input_request";
  return (
    <li
      className={cn(
        "my-2 rounded-md border px-3 py-2.5",
        pending ? "border-warning/50 bg-warning/5" : "border-line bg-panel",
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldQuestion
          size={15}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-warning"
        />
        <div className="min-w-0 flex-1">
          <p className="text-metadata font-medium text-foreground">
            {isQuestion ? "The agent needs an answer" : "Approval required"}
          </p>
          <p className="mt-1 break-words text-supporting text-foreground">
            {prompt}
          </p>
          {isQuestion && !!options.length && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-metadata text-muted">
              {options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ul>
          )}
          {pending && requestId && (
            <div className="mt-2 space-y-2">
              {isQuestion && (
                <Textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  aria-label="Answer"
                  placeholder="Type your answer"
                  rows={2}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={decide.isPending || (isQuestion && !answer.trim())}
                  onClick={() =>
                    decide.mutate({
                      requestId,
                      decision: {
                        decision: "allow",
                        ...(answer.trim() ? { answer: answer.trim() } : {}),
                      },
                    })
                  }
                >
                  {decide.isPending ? (
                    <LoaderCircle
                      size={14}
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  {isQuestion ? "Send answer" : "Allow"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ requestId, decision: { decision: "deny" } })
                  }
                >
                  {isQuestion ? "Skip" : "Deny"}
                </Button>
              </div>
              {decide.error && (
                <p role="alert" className="text-metadata text-destructive">
                  {decide.error.message}
                </p>
              )}
            </div>
          )}
          {!pending && (
            <p className="mt-1 text-metadata text-muted">
              Decision: {stringValue(payload.decision) || "answered"}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function Item({
  item,
  profileId,
  threadId,
}: {
  item: HarnessItem;
  profileId: string;
  threadId: string;
}) {
  if (item.type === "user_message")
    return (
      <li className="py-2">
        <p className="text-metadata text-muted">You</p>
        <div className="mt-0.5 text-supporting">
          <Markdown>{item.text ?? ""}</Markdown>
        </div>
      </li>
    );
  if (item.type === "assistant_message")
    return (
      <li className="py-2">
        <p className="text-metadata text-muted">Agent</p>
        <div className="mt-0.5 text-supporting">
          <Markdown>{item.text ?? ""}</Markdown>
        </div>
      </li>
    );
  if (item.type === "reasoning")
    return (
      <li className="py-1">
        <details>
          <summary className="cursor-pointer text-metadata text-muted hover:text-foreground">
            Reasoning
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words text-metadata text-muted">
            {item.text}
          </p>
        </details>
      </li>
    );
  if (item.type === "approval_request" || item.type === "user_input_request")
    return (
      <RequestItem item={item} profileId={profileId} threadId={threadId} />
    );
  if (item.type === "error")
    return (
      <li
        role="alert"
        className="my-1 rounded border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-metadata text-destructive"
      >
        {item.text ?? item.title ?? "The run failed."}
      </li>
    );
  if (item.type === "system_notice")
    return <li className="py-1 text-metadata text-muted">{item.text}</li>;
  return <ToolItem item={item} />;
}

function ThreadTurn({
  detail,
  turn,
  profileId,
}: {
  detail: HarnessThreadDetail;
  turn: HarnessThreadDetail["turns"][number];
  profileId: string;
}) {
  return (
    <section className="border-t border-line pt-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2 text-metadata text-muted">
        <span className="font-medium text-foreground">Turn {turn.ordinal}</span>
        <StatusDot status={turn.status} />
        <span>{turn.model}</span>
        <span>{turn.runtimeMode}</span>
        {turn.totalTokens !== null && (
          <span>{turn.totalTokens.toLocaleString()} tokens</span>
        )}
      </div>
      <ul className="mt-1 divide-y divide-line">
        {turn.items.map((item) => (
          <Item
            key={item.id}
            item={item}
            profileId={profileId}
            threadId={detail.thread.id}
          />
        ))}
      </ul>
    </section>
  );
}

export function HarnessTranscript({
  profileId,
  threadId,
  className,
}: {
  profileId: string;
  threadId: string;
  className?: string;
}) {
  const query = useHarnessThread(profileId, threadId);
  const stop = useStopHarnessThread(profileId);
  const retry = useRetryHarnessThread(profileId);
  if (query.isPending)
    return (
      <p role="status" className="text-metadata text-muted">
        Loading run transcript…
      </p>
    );
  if (query.error)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-metadata text-destructive">
          {query.error.message}
        </p>
        <Button size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  if (!query.data) return null;
  const detail = query.data;
  const active = ["queued", "running", "waiting"].includes(
    detail.thread.status,
  );
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 break-words text-metadata text-muted">
          {detail.thread.title}
        </p>
        <StatusDot status={detail.thread.status} />
        <span className="text-metadata text-muted">{detail.thread.status}</span>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            disabled={stop.isPending}
            onClick={() => stop.mutate(detail.thread.id)}
          >
            {stop.isPending ? (
              <LoaderCircle
                size={13}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Square size={11} />
            )}
            Stop
          </Button>
        )}
        {["failed", "cancelled", "interrupted"].includes(
          detail.thread.status,
        ) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={retry.isPending}
            onClick={() => retry.mutate(detail.thread.id)}
          >
            {retry.isPending ? "Retrying…" : "Retry run"}
          </Button>
        )}
      </div>
      {(stop.error || retry.error) && (
        <p role="alert" className="mt-1 text-metadata text-destructive">
          {(stop.error ?? retry.error)?.message}
        </p>
      )}
      {detail.thread.errorMessage && (
        <p className="mt-1 break-words text-metadata text-destructive">
          {detail.thread.errorMessage}
        </p>
      )}
      <div className="mt-2 space-y-3">
        {detail.turns.length ? (
          detail.turns.map((turn) => (
            <ThreadTurn
              key={turn.id}
              detail={detail}
              turn={turn}
              profileId={profileId}
            />
          ))
        ) : (
          <p className="text-metadata text-muted">No turns recorded yet.</p>
        )}
      </div>
    </div>
  );
}

export function HarnessThreadPanel({
  profileId,
  kind,
  challengeId,
  empty = "No runs recorded yet.",
}: {
  profileId: string;
  kind: string;
  challengeId?: string;
  empty?: string;
}) {
  const threads = useHarnessThreads(profileId, {
    kind,
    challengeId,
    limit: 20,
  });
  const [selected, setSelected] = useState<string>("");
  if (threads.isPending)
    return (
      <p role="status" className="text-metadata text-muted">
        Loading runs…
      </p>
    );
  if (threads.error)
    return (
      <p role="alert" className="text-metadata text-destructive">
        {threads.error.message}
      </p>
    );
  const items = threads.data ?? [];
  if (!items.length) return <p className="text-metadata text-muted">{empty}</p>;
  const activeId =
    selected ||
    items.find((thread) =>
      ["queued", "running", "waiting"].includes(thread.status),
    )?.id ||
    items[0]!.id;
  return (
    <div className="space-y-2">
      {items.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-metadata text-muted">
          Run
          <select
            className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 text-metadata text-foreground"
            value={activeId}
            onChange={(event) => setSelected(event.target.value)}
          >
            {items.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {new Date(thread.createdAt).toLocaleString()} · {thread.status}{" "}
                · {thread.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <HarnessTranscript profileId={profileId} threadId={activeId} />
    </div>
  );
}
