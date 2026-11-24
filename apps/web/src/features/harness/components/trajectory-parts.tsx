import { useState, type ReactNode } from "react";
import { ChevronRight, Maximize2, Wrench, X } from "lucide-react";
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
  model_request: "bg-brand-soft text-foreground",
  notice: "bg-panel text-muted",
  error: "bg-destructive/10 text-destructive",
};

/** Parses displayed text as JSON; prompts and plain output return null. */
function jsonValueFor(text: string): unknown | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  return parseTrajectoryJson(trimmed);
}

function JsonScalar({ value }: { value: unknown }) {
  if (value === null) return <span className="text-destructive">null</span>;
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-success" : "text-destructive"}>
        {value ? "true" : "false"}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="tabular-nums text-warning">{String(value)}</span>;
  }
  if (typeof value !== "string") return <span className="text-muted">—</span>;
  return (
    <span className="whitespace-pre-wrap break-words text-success">
      "{value}"
    </span>
  );
}

function describeNode(value: object) {
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  const noun = Array.isArray(value) ? "item" : "key";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One JSON property or entry; objects and arrays fold into a one-line summary. */
function JsonNode({
  name,
  value,
  comma,
}: {
  name?: string;
  value: unknown;
  comma: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (value === null || typeof value !== "object") {
    return (
      <div className="flex items-baseline gap-2 rounded-sm px-1 py-px hover:bg-elevated/30">
        {name !== undefined && <span className="text-brand">{name}:</span>}
        <JsonScalar value={value} />
        {comma && <span className="text-muted">,</span>}
      </div>
    );
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  const openBracket = Array.isArray(value) ? "[" : "{";
  const closeBracket = Array.isArray(value) ? "]" : "}";
  const empty = entries.length === 0;
  const folded = !open && !empty;
  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-sm px-1 py-px hover:bg-elevated/30">
        {!empty && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={name === undefined ? "Toggle value" : `Toggle ${name}`}
            onClick={() => setOpen((current) => !current)}
            className="flex size-4 shrink-0 items-center justify-center rounded-xs text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronRight
              size={11}
              aria-hidden="true"
              className={cn(
                "transition-transform duration-150",
                open && "rotate-90",
              )}
            />
          </button>
        )}
        {name !== undefined && <span className="text-brand">{name}:</span>}
        <span className="text-muted">{openBracket}</span>
        {empty ? (
          <span className="text-muted">{closeBracket}</span>
        ) : (
          folded && (
            <>
              <span aria-hidden="true" className="text-muted">
                …
              </span>
              <span className="text-muted">{closeBracket}</span>
              <span className="text-metadata text-muted">
                {describeNode(value)}
              </span>
            </>
          )
        )}
        {(empty || folded) && comma && <span className="text-muted">,</span>}
      </div>
      {open && !empty && (
        <>
          <div className="ml-2 min-w-0 border-l border-line/60 pl-4">
            {entries.map(([key, entry], index) => (
              <JsonNode
                key={key}
                name={key}
                value={entry}
                comma={index < entries.length - 1}
              />
            ))}
          </div>
          <div className="px-1 text-muted">
            {closeBracket}
            {comma && ","}
          </div>
        </>
      )}
    </div>
  );
}

/** Interactive JSON reader: depth guides, palette colors, foldable nodes. */
export function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="min-w-0 px-3 py-2.5 font-mono text-code leading-relaxed text-foreground select-text">
      <JsonNode value={value} comma={false} />
    </div>
  );
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
  const parsed = jsonValueFor(text);
  return (
    <div
      className={cn(
        "scrollbar-quiet select-text overflow-auto rounded-md border border-line bg-canvas",
        maxHeight,
        className,
      )}
    >
      {parsed !== null ? (
        <JsonTree value={parsed} />
      ) : (
        <pre className="px-3 py-2.5 font-mono text-code leading-relaxed break-words whitespace-pre-wrap text-foreground">
          {text}
        </pre>
      )}
    </div>
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
  const parsed = jsonValueFor(text);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[min(88dvh,900px)] w-[min(90vw,1150px)] max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <h4 className="truncate text-metadata font-medium tracking-wide text-muted uppercase">
            {label}
          </h4>
          <div className="flex items-center gap-0.5">
            <CopyButton
              text={text}
              label="Copy"
              ariaLabel={`Copy ${label.toLowerCase()}`}
              iconOnly
            />
            <DialogClose asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Close (Escape)"
                aria-label="Close"
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
        </div>
        <div className="scrollbar-visible min-h-0 min-w-0 flex-1 select-text overflow-auto bg-canvas">
          {parsed !== null ? (
            <JsonTree value={parsed} />
          ) : (
            <pre className="px-3 py-2.5 font-mono text-code leading-relaxed break-words whitespace-pre-wrap text-foreground">
              {text}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CodeSection({
  label,
  text,
  empty = "Nothing was recorded for this record.",
}: {
  label: string;
  text: string;
  empty?: string;
}) {
  if (!text) return <p className="text-supporting text-muted">{empty}</p>;
  return (
    <section className="space-y-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ui font-medium">{label}</h3>
        <CopyButton
          text={text}
          label="Copy"
          ariaLabel={`Copy ${label.toLowerCase()}`}
          iconOnly
        />
      </div>
      <CodeBlock text={text} maxHeight="max-h-none" />
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
            <div className="flex items-center gap-0.5">
              <Button
                size="icon-sm"
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
                iconOnly
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
              size={13}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-warning"
            />
            <span className="min-w-0 flex-1">
              <span className="font-mono text-supporting text-foreground">
                {tool.name}
              </span>
              {tool.description && (
                <span className="mt-1 block text-metadata text-muted">
                  {tool.description}
                </span>
              )}
            </span>
            <ChevronRight
              size={13}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-90"
            />
          </summary>
          <ToolParameters tool={tool} />
        </details>
      ))}
    </div>
  );
}
