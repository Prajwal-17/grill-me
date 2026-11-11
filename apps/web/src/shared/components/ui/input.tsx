import * as React from "react";
import { cn } from "@/shared/lib/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-1 text-base transition-[border-color,box-shadow] duration-150 outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-panel file:text-ui file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-input-hover disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:text-ui",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
