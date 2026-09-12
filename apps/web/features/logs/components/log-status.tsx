import { Check, CircleAlert, LoaderCircle, Minus } from "lucide-react";
import { cn } from "../../../shared/lib/cn";
import { STATUS_LABELS } from "../lib/log-formatters";
import type { LogStatus } from "../types";
export function LogStatusBadge({ status }: { status: LogStatus }) {
  const Icon =
    status === "success"
      ? Check
      : status === "error"
        ? CircleAlert
        : status === "running"
          ? LoaderCircle
          : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium",
        status === "success"
          ? "border-success/20 bg-success/5 text-success"
          : status === "error"
            ? "border-destructive/20 bg-destructive/5 text-destructive"
            : "border-line bg-elevated/40 text-muted",
      )}
    >
      <Icon
        size={12}
        className={status === "running" ? "animate-spin" : undefined}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
