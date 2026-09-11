import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
type ButtonVariant = "primary" | "secondary" | "ghost" | "hint" | "review";
const variants: Record<ButtonVariant, string> = {
  primary: "border-foreground bg-foreground text-canvas hover:opacity-85",
  secondary: "border-line-strong bg-surface text-foreground hover:bg-elevated",
  ghost:
    "border-transparent text-muted hover:bg-elevated hover:text-foreground",
  hint: "border-line-strong bg-surface text-foreground hover:bg-elevated",
  review: "border-foreground bg-elevated text-foreground",
};
export function buttonStyles(
  variant: ButtonVariant = "secondary",
  size: "default" | "lg" = "default",
) {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium disabled:pointer-events-none disabled:opacity-45 md:min-h-9",
    variants[variant],
    size === "lg" && "min-h-11 px-4",
  );
}
export function Button({
  variant = "secondary",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "default" | "lg";
}) {
  return (
    <button className={cn(buttonStyles(variant, size), className)} {...props} />
  );
}
