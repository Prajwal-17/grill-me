import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { Button } from "./button";
export function LoadingIndicator({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-sm text-muted"
      role="status"
    >
      <LoaderCircle size={16} className="animate-spin" />
      {label}
    </span>
  );
}
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="flex min-h-[60dvh] items-center justify-center">
      <LoadingIndicator label={label} />
    </main>
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
    <main className="page">
      <div className="mx-auto max-w-md py-16">
        <AlertCircle size={22} className="mb-4 text-muted" />
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <Button className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border-y border-line py-8 text-sm text-muted">
      {children}
    </div>
  );
}
