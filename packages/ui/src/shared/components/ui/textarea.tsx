import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import * as React from "react";
import { cn } from "@/shared/lib/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <PromptTextarea
      minHeight={64}
      data-slot="textarea"
      className={cn(
        "flex resize-none min-h-16 w-full rounded-lg border border-input bg-surface px-3 py-2 text-base transition-[border-color,box-shadow] duration-150 hover:border-input-hover outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-ui dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
