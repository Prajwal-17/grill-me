import { CopyButton } from "@/shared/components/ui/copy-button";
import { prettyPayload } from "@/features/logs/lib/log-formatters";
import { JsonInspector } from "@/features/logs/components/json-inspector";

function payload(value: unknown) {
  if (typeof value === "string") {
    if (!value) return { source: "", structured: null };
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === "object") {
        return { source: prettyPayload(parsed), structured: parsed };
      }
    } catch {
      // Plain text responses and instructions stay readable as text.
    }
    return { source: value, structured: null };
  }
  if (value === undefined || value === null)
    return { source: "", structured: null };
  return { source: prettyPayload(value), structured: value };
}

export function LogPayload({
  title,
  value,
  empty = "No content recorded.",
  defaultView = "formatted",
}: {
  title: string;
  value: unknown;
  empty?: string;
  defaultView?: "formatted" | "source";
}) {
  const content = payload(value);
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {content.source && (
          <CopyButton
            text={content.source}
            ariaLabel={`Copy ${title.toLowerCase()}`}
          />
        )}
      </header>
      {content.structured !== null ? (
        <JsonInspector
          value={content.structured}
          source={content.source}
          label={title}
          defaultView={defaultView}
        />
      ) : content.source ? (
        <pre
          tabIndex={0}
          aria-label={title}
          className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-6 outline-offset-[-2px]"
        >
          <code>{content.source}</code>
        </pre>
      ) : (
        <p className="p-5 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
