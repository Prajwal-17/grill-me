import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "hint" | "review";

const base =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary: "border-brand bg-brand text-white hover:bg-blue-500",
  secondary:
    "border-line bg-elevated text-foreground hover:border-slate-500 hover:bg-slate-800",
  ghost:
    "border-transparent bg-transparent text-muted hover:bg-elevated hover:text-foreground",
  hint: "border-brand/30 bg-transparent text-blue-300 hover:bg-brand/10",
  review: "border-brand/45 bg-brand/10 text-blue-200 hover:bg-brand/15",
};

export function buttonStyles(variant: ButtonVariant = "secondary") {
  return cn(base, variants[variant]);
}

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cn(buttonStyles(variant), className)} {...props} />;
}
