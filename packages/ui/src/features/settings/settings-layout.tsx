import type { ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";

export function SettingsHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h2 className="text-section font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-supporting text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
export function SettingsRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2 border-b border-line py-4 last:border-b-0 @min-[600px]:grid-cols-[150px_minmax(0,1fr)] @min-[600px]:gap-6">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="pt-1.5 text-ui font-medium">
          {label}
        </label>
      ) : (
        <div className="pt-1.5 text-ui font-medium">{label}</div>
      )}
      <div className="min-w-0 [&_input]:text-ui [&_[role=combobox]]:h-9">
        {children}
      </div>
    </div>
  );
}
export function SettingsFeedback({
  error,
  message,
  onRetry,
}: {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
}) {
  if (!error && !message) return null;
  const Icon = error ? CircleAlert : Check;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-supporting ${error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-line bg-surface text-foreground"}`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">
        {error?.message ?? message}
      </span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 shrink-0"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
export function SettingsLoading() {
  return (
    <LoadingRegion label="Loading settings" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </LoadingRegion>
  );
}
