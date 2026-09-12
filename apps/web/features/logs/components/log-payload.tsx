import { CopyButton } from "../../../shared/components/ui/copy-button";
export function LogPayload({
  title,
  text,
  empty = "No content recorded.",
}: {
  title: string;
  text: string;
  empty?: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {text && (
          <CopyButton text={text} ariaLabel={`Copy ${title.toLowerCase()}`} />
        )}
      </header>
      {text ? (
        <pre
          tabIndex={0}
          aria-label={title}
          className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-6 outline-offset-[-2px]"
        >
          <code>{text}</code>
        </pre>
      ) : (
        <p className="p-5 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
