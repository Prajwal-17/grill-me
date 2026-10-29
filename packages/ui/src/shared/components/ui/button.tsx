import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/cn";

// Adapted from shadcn/ui. See LICENSE.md.
export const buttonVariants = cva(
  "pressable inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-ui font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover",
        default:
          "border border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover",
        secondary:
          "border border-input bg-surface text-foreground hover:border-input-hover hover:bg-brand-soft",
        outline:
          "border border-input bg-surface text-foreground hover:border-input-hover hover:bg-brand-soft",
        ghost:
          "border border-transparent text-muted hover:bg-elevated hover:text-foreground",
        hint: "border border-input bg-surface text-foreground hover:border-input-hover hover:bg-brand-soft",
        review: "border border-foreground/25 bg-elevated text-foreground",
        destructive:
          "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-3 md:h-8",
        sm: "h-8 gap-1.5 px-2.5 text-metadata",
        lg: "h-11 px-4",
        icon: "size-10 md:size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);
export function buttonStyles(
  variant: NonNullable<
    VariantProps<typeof buttonVariants>["variant"]
  > = "secondary",
  size: NonNullable<VariantProps<typeof buttonVariants>["size"]> = "default",
) {
  return buttonVariants({ variant, size });
}
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
