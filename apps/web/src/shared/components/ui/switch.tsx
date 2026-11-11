import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-muted p-0.5 outline-offset-4 transition-colors before:absolute before:-inset-2.5 before:content-[''] data-[state=checked]:bg-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-surface transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-canvas motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );
}
