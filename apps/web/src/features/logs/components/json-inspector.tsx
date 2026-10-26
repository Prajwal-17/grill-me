import hljs from "highlight.js/lib/common";
import {
  Braces,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ListTree,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";

type View = "formatted" | "source";

function isContainer(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

function children(value: Record<string, unknown> | unknown[]) {
  return Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
}

function childPath(parent: string, key: string) {
  return `${parent}/${encodeURIComponent(key)}`;
}

function expandablePaths(value: unknown, path = "$", paths: string[] = []) {
  if (!isContainer(value) || children(value).length === 0) return paths;
  paths.push(path);
  for (const [key, item] of children(value)) {
    expandablePaths(item, childPath(path, key), paths);
  }
  return paths;
}

function containerLabel(value: Record<string, unknown> | unknown[]) {
  const count = children(value).length;
  if (Array.isArray(value)) return `${count} ${count === 1 ? "item" : "items"}`;
  return `${count} ${count === 1 ? "field" : "fields"}`;
}

const ACRONYMS: Record<string, string> = {
  api: "API",
  http: "HTTP",
  id: "ID",
  json: "JSON",
  ms: "ms",
  url: "URL",
  usd: "USD",
};

function readableKey(key: string) {
  if (/^\[\d+\]$/.test(key)) return key;
  return key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word, index) => {
      const acronym = ACRONYMS[word.toLowerCase()];
      if (acronym) return acronym;
      const lower = word.toLowerCase();
      return index === 0 ? lower[0]!.toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

function JsonKey({ value }: { value: string }) {
  const readable = readableKey(value);
  return (
    <span
      className="break-words text-muted"
      title={readable === value ? undefined : value}
    >
      {readable}
      <span aria-hidden="true">:</span>
    </span>
  );
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-destructive">null</span>;
  if (typeof value === "string")
    return value ? (
      <span className="whitespace-pre-wrap break-words text-success">
        {value}
      </span>
    ) : (
      <span className="text-muted">Empty string</span>
    );
  if (typeof value === "number")
    return <span className="text-warning">{String(value)}</span>;
  if (typeof value === "boolean")
    return <span className="text-destructive">{String(value)}</span>;
  return <span className="text-muted">{String(value)}</span>;
}

function JsonNode({
  label,
  value,
  path,
  expanded,
  onToggle,
}: {
  label?: string;
  value: unknown;
  path: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  if (!isContainer(value)) {
    return (
      <div className="grid gap-1 border-b border-line/60 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] sm:gap-4">
        {label && <JsonKey value={label} />}
        <span className="min-w-0">
          <Primitive value={value} />
        </span>
      </div>
    );
  }

  const entries = children(value);
  if (entries.length === 0) {
    return (
      <div className="grid gap-1 border-b border-line/60 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] sm:gap-4">
        {label && <JsonKey value={label} />}
        <span className="text-muted">{Array.isArray(value) ? "[]" : "{}"}</span>
      </div>
    );
  }

  const open = expanded.has(path);
  return (
    <div className="border-b border-line/60 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(path)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-elevated/35"
      >
        <ChevronRight
          size={14}
          className={cn(
            "shrink-0 text-muted transition-transform",
            open && "rotate-90",
          )}
        />
        {label && (
          <span
            className="min-w-0 break-words"
            title={readableKey(label) === label ? undefined : label}
          >
            {readableKey(label)}
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted">
          {containerLabel(value)}
        </span>
      </button>
      {open && (
        <div className="ml-3 border-l border-line bg-canvas/30 pl-2 sm:ml-4 sm:pl-3">
          {entries.map(([key, item]) => (
            <JsonNode
              key={key}
              label={Array.isArray(value) ? `[${key}]` : key}
              value={item}
              path={childPath(path, key)}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonInspector({
  value,
  source,
  label,
  defaultView = "formatted",
}: {
  value: unknown;
  source: string;
  label: string;
  defaultView?: View;
}) {
  const paths = useMemo(() => expandablePaths(value), [value]);
  const [view, setView] = useState<View>(defaultView);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(paths.slice(0, 1)),
  );
  const highlighted = useMemo(() => {
    if (source.length > 250_000) return null;
    try {
      return hljs.highlight(source, {
        language: "json",
        ignoreIllegals: true,
      }).value;
    } catch {
      return null;
    }
  }, [source]);

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/50 px-3 py-2">
        <div
          role="group"
          aria-label={`${label} view`}
          className="inline-flex rounded-md border border-line bg-surface p-0.5"
        >
          <button
            type="button"
            aria-pressed={view === "formatted"}
            onClick={() => setView("formatted")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted hover:text-foreground",
              view === "formatted" &&
                "bg-elevated font-medium text-foreground shadow-xs",
            )}
          >
            <ListTree size={13} />
            Formatted
          </button>
          <button
            type="button"
            aria-pressed={view === "source"}
            onClick={() => setView("source")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted hover:text-foreground",
              view === "source" &&
                "bg-elevated font-medium text-foreground shadow-xs",
            )}
          >
            <Braces size={13} />
            JSON
          </button>
        </div>
        {view === "formatted" && paths.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(new Set(paths))}
              className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted hover:bg-elevated hover:text-foreground"
            >
              <ChevronsUpDown size={13} />
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted hover:bg-elevated hover:text-foreground"
            >
              <ChevronsDownUp size={13} />
              Collapse
            </button>
          </div>
        )}
      </div>
      {view === "formatted" ? (
        <div
          tabIndex={0}
          aria-label={`${label} formatted JSON`}
          className="max-h-[65dvh] overflow-auto font-mono text-[13px] leading-5 outline-offset-[-2px]"
        >
          <JsonNode
            value={value}
            path="$"
            expanded={expanded}
            onToggle={toggle}
          />
        </div>
      ) : (
        <pre
          tabIndex={0}
          aria-label={`${label} JSON source`}
          className="code-block m-0 max-h-[65dvh] overflow-auto whitespace-pre p-4 font-mono text-[13px] leading-6 outline-offset-[-2px]"
        >
          {highlighted === null ? (
            <code>{source}</code>
          ) : (
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          )}
        </pre>
      )}
    </>
  );
}
