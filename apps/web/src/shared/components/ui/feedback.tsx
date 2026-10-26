import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "./skeleton";
export function LoadingIndicator({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-ui text-muted"
      role="status"
    >
      <LoaderCircle size={16} className="animate-spin" />
      {label}
    </span>
  );
}
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="mx-auto w-full max-w-[1280px] p-4 md:p-6"
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-5">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="divide-y divide-line rounded-lg border border-line">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-4 p-4">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mx-auto w-full max-w-[1280px] p-4 md:p-6">
      <div className="max-w-lg rounded-lg border border-line bg-panel p-6">
        <AlertCircle size={20} className="mb-3 text-destructive" />
        <h2 className="text-section font-semibold">{title}</h2>
        <p className="mt-2 break-words text-ui leading-6 text-muted">
          {message}
        </p>
        <Button className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border-y border-line py-8 text-ui text-muted">
      {children}
    </div>
  );
}
