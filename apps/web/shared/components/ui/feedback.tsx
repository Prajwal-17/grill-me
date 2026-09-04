import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export function LoadingScreen({ label = "Loading..." }: { label?: string }) {
  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center gap-2 text-sm text-muted">
      <LoaderCircle className="animate-spin" size={18} />
      <span>{label}</span>
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
    <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted">{message}</p>
      <Button className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </main>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}
