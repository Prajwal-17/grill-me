import { Check, CircleAlert, LoaderCircle, Minus } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { STATUS_LABELS } from "@/features/logs/lib/log-formatters";
import type { LogStatus } from "@/features/logs/types";
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-metadata font-medium leading-4",
        status === "success"
          ? "border-success/20 bg-success/5 text-success"
          : status === "error"
            ? "border-destructive/20 bg-destructive/5 text-destructive"
            : "border-line bg-elevated/40 text-muted",
      )}
    >
      <Icon
        size={10}
        className={status === "running" ? "animate-spin" : undefined}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
