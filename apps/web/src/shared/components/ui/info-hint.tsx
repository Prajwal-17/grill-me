import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/cn";

/** Small info button that shows a one-line explanation on hover or focus. */
export function InfoHint({
  text,
  label = "What is this?",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info size={12} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
