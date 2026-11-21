import { useState, type ReactNode } from "react";
import { Maximize2, Wrench } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { CopyButton } from "@/shared/components/ui/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/cn";
import {
  formatTrajectoryValue,
  parseTrajectoryJson,
  type TrajectoryKind,
  type TrajectoryToolSnapshot,
} from "../lib/trajectory";

/** Shared ledger/inspector pill classes for a record kind. */
export const trajectoryTagClass: Record<TrajectoryKind, string> = {
  system: "bg-panel text-muted",
  user: "bg-elevated text-foreground",
  context: "bg-success/10 text-success",
  assistant: "bg-brand-soft text-foreground",
  reasoning: "bg-elevated text-muted",
  tool: "bg-warning/10 text-warning",
  result: "bg-success/10 text-success",
  request: "bg-warning/10 text-warning",
  notice: "bg-panel text-muted",
  error: "bg-destructive/10 text-destructive",
};

const jsonTokenPattern =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:]/g;

/**
 * Colors JSON records (keys, strings, numbers, keywords) with the app
 * palette; non-JSON content such as prompts and command output stays plain.
 */
function highlightJson(text: string): ReactNode | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  if (parseTrajectoryJson(trimmed) === null) return null;
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(jsonTokenPattern.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  const push = (content: string, className?: string) => {
    if (!content) return;
    nodes.push(
      className ? (
        <span key={key++} className={className}>
          {content}
        </span>
      ) : (
        content
      ),
    );
  };
  while ((match = pattern.exec(text))) {
    push(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const [token, quoted, colon] = match;
    if (quoted) {
      push(token, colon ? "text-brand" : "text-success");
    } else if (token === "true" || token === "false" || token === "null") {
      push(token, token === "true" ? "text-success" : "text-destructive");
    } else if (/^-?\d/.test(token)) {
      push(token, "text-warning");
    } else {
      push(token, "text-muted");
    }
  }
  push(text.slice(cursor));
  return nodes;
}

export function CodeBlock({
  text,
  maxHeight = "max-h-[min(70dvh,760px)]",
  className,
}: {
  text: string;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "scrollbar-quiet select-text overflow-auto rounded-md border border-line bg-canvas px-3 py-2.5 font-mono text-code leading-relaxed break-words whitespace-pre-wrap text-foreground",
        maxHeight,
        className,
      )}
    >
      {highlightJson(text) ?? text}
    </pre>
  );
}

export function EnlargedCodeDialog({
  label,
  text,
  open,
  onOpenChange,
}: {
  label: string;
  text: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[min(90dvh,900px)] w-[min(96vw,1240px)] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h4 className="text-metadata font-medium tracking-wide text-muted uppercase">
            {label}
          </h4>
          <div className="flex items-center gap-1">
            <CopyButton
              text={text}
              label="Copy"
              ariaLabel={`Copy ${label.toLowerCase()}`}
            />
            <DialogClose asChild>
              <Button size="sm" variant="ghost" title="Close (Escape)">
                Close
              </Button>
            </DialogClose>
          </div>
        </div>
        <pre className="scrollbar-visible min-h-0 flex-1 select-text overflow-auto bg-canvas px-4 py-3 font-mono text-code leading-relaxed whitespace-pre-wrap break-words text-foreground">
          {highlightJson(text) ?? text}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

export function CodeSection({
  label,
  text,
  empty = "Nothing was recorded for this record.",
  maxHeight,
}: {
  label: string;
  text: string;
  empty?: string;
  maxHeight?: string;
}) {
  const [enlarged, setEnlarged] = useState(false);
  if (!text) return <p className="text-supporting text-muted">{empty}</p>;
  return (
    <section className="space-y-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-metadata font-medium tracking-wide text-muted uppercase">
          {label}
        </h4>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Enlarge"
            aria-label={`Enlarge ${label.toLowerCase()}`}
            onClick={() => setEnlarged(true)}
          >
            <Maximize2 size={13} aria-hidden="true" />
          </Button>
          <CopyButton
            text={text}
            label="Copy"
            ariaLabel={`Copy ${label.toLowerCase()}`}
          />
        </div>
      </div>
      <CodeBlock text={text} maxHeight={maxHeight} />
      <EnlargedCodeDialog
        label={label}
        text={text}
        open={enlarged}
        onOpenChange={setEnlarged}
      />
    </section>
  );
}

function ToolParameters({ tool }: { tool: TrajectoryToolSnapshot }) {
  const [enlarged, setEnlarged] = useState(false);
  const text = formatTrajectoryValue(tool.parameters);
  return (
    <div className="border-t border-line px-2.5 py-2">
      {text ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h5 className="text-metadata font-medium tracking-wide text-muted uppercase">
              Parameters
            </h5>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                title="Enlarge"
                aria-label={`Enlarge ${tool.name} parameters`}
                onClick={() => setEnlarged(true)}
              >
                <Maximize2 size={13} aria-hidden="true" />
              </Button>
              <CopyButton
                text={text}
                label="Copy"
                ariaLabel={`Copy ${tool.name} parameters`}
              />
            </div>
          </div>
          <CodeBlock text={text} maxHeight="max-h-72" />
          <EnlargedCodeDialog
            label={`${tool.name} parameters`}
            text={text}
            open={enlarged}
            onOpenChange={setEnlarged}
          />
        </div>
      ) : (
        <p className="text-metadata text-muted">No parameters.</p>
      )}
    </div>
  );
}

export function ToolCatalog({ tools }: { tools: TrajectoryToolSnapshot[] }) {
  if (!tools.length)
    return <p className="text-supporting text-muted">No tools were offered.</p>;
  return (
    <div className="space-y-1.5">
      {tools.map((tool) => (
        <details
          key={tool.name}
          className="group rounded-md border border-line bg-canvas"
        >
          <summary className="flex cursor-pointer list-none items-start gap-2 px-2.5 py-2 [&::-webkit-details-marker]:hidden">
            <Wrench
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-muted"
            />
            <span className="min-w-0 flex-1">
              <span className="font-mono text-supporting">{tool.name}</span>
              {tool.description && (
                <span className="mt-0.5 block text-metadata text-muted">
                  {tool.description}
                </span>
              )}
            </span>
            <span
              aria-hidden="true"
              className="mt-0.5 text-muted transition-transform group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <ToolParameters tool={tool} />
        </details>
      ))}
    </div>
  );
}
