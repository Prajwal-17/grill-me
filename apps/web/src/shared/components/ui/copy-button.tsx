import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";

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
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        size="sm"
        variant="ghost"
        aria-label={ariaLabel}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "copied" ? <Check size={14} /> : <Copy size={14} />}
        <span aria-live="polite">
          {state === "copied"
            ? "Copied"
            : state === "error"
              ? "Retry copy"
              : label}
        </span>
      </Button>
      {state === "error" && (
        <span role="alert" className="text-xs text-destructive">
          Clipboard unavailable. Select and copy the text.
        </span>
      )}
    </span>
  );
}
