import type { ReactNode } from "react";
import { QueryProvider } from "@/shared/components/query-provider";
import { UIProvider } from "@/shared/components/ui/ui-provider";
import { env } from "@/shared/config/env";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <UIProvider>{children}</UIProvider>
      {env.appEnv === "development" && (
        <div
          aria-label="Development environment"
          className="pointer-events-none fixed bottom-3 right-3 z-[100] rounded-md border border-line bg-elevated px-2.5 py-1 font-mono text-metadata font-semibold tracking-wider text-muted"
        >
          DEV
        </div>
      )}
    </QueryProvider>
  );
}
