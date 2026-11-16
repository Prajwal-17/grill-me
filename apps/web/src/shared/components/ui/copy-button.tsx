import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { writeClipboardText } from "@/shared/lib/clipboard";

export function CopyButton({
  text,
  label = "Copy",
  ariaLabel = label,
}: {
  text: string;
  label?: string;
  ariaLabel?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [state]);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        size="sm"
        variant="ghost"
        aria-label={ariaLabel}
        onClick={async () => {
          try {
            await writeClipboardText(text);
            setState("copied");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "copied" ? (
          <Check size={14} className="feedback-check" />
        ) : (
          <Copy size={14} />
        )}
        <span className="grid" aria-live="polite">
          {/* Reserve label width so acknowledgement never moves adjacent actions. */}
          {(["idle", "copied", "error"] as const).map((value) => (
            <span
              key={value}
              className={`col-start-1 row-start-1 ${state === value ? "" : "invisible"}`}
              aria-hidden={state !== value}
            >
              {value === "idle"
                ? label
                : value === "copied"
                  ? "Copied"
                  : "Retry copy"}
            </span>
          ))}
        </span>
      </Button>
      {state === "error" && (
        <span role="alert" className="text-metadata text-destructive">
          Clipboard unavailable. Select and copy the text.
        </span>
      )}
    </span>
  );
}
