import { useId, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/cn";

export function SettingsHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-section font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        <p className="mt-1 text-supporting text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mb-6">
      <h3 id={id} className="mb-2.5 text-ui font-semibold">
        {title}
      </h3>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}
export function SettingsRow({
  label,
  description,
  htmlFor,
  controlClassName,
  children,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  controlClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 py-3.5 @min-[600px]:flex-row @min-[600px]:items-center @min-[600px]:justify-between @min-[600px]:gap-6">
      <div className="min-w-0 flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-ui font-medium">
            {label}
          </label>
        ) : (
          <p className="text-ui font-medium">{label}</p>
        )}
        {description && (
          <p className="mt-0.5 text-supporting text-muted">{description}</p>
        )}
      </div>
      <div
        className={cn(
          "w-full min-w-0 shrink-0 @min-[600px]:w-56",
          controlClassName,
        )}
      >
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
