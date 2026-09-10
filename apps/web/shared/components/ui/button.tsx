import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "hint" | "review";
type ButtonSize = "default" | "lg";

const base =
  "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-all duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none disabled:transform-none";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-brand bg-brand text-slate-950 shadow-lg shadow-brand/15 hover:border-brand-bright hover:bg-brand-bright hover:shadow-brand/25",
  secondary:
    "border-line-strong bg-elevated/85 text-foreground shadow-sm shadow-black/15 hover:border-brand/40 hover:bg-elevated",
  ghost:
    "border-transparent bg-transparent text-muted hover:bg-elevated hover:text-foreground",
  hint: "border-brand/30 bg-transparent text-brand-bright hover:bg-brand/10",
  review:
    "border-brand/45 bg-brand/10 text-brand-bright shadow-sm shadow-brand/10 hover:bg-brand/15",
};

const sizes: Record<ButtonSize, string> = {
  default: "min-h-9",
  lg: "min-h-11 px-4",
};

export function buttonStyles(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "default",
) {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant = "secondary",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={cn(buttonStyles(variant, size), className)} {...props} />
  );
}
