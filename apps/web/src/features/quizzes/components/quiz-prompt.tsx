import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export function QuizPrompt({
  prompt,
  className,
  defaultOpen = false,
}: {
  prompt: string;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen || undefined}
      className={cn("group text-ui", className)}
    >
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-muted transition-colors duration-100 hover:text-foreground">
        <ChevronRight
          size={14}
          aria-hidden="true"
          className="motion-chevron shrink-0 group-open:rotate-90"
        />
        Original prompt
      </summary>
      <div className="mt-2 max-h-40 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md border border-line bg-canvas/60 px-3 py-2.5 text-supporting leading-6 text-muted">
        {prompt}
      </div>
    </details>
  );
}
