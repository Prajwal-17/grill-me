import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AlertCircle } from "lucide-react";
import type { ProviderHealth } from "@repo/contracts";
import { apiRequest } from "@/shared/lib/api-client";
import { localTransport } from "@/shared/lib/local-client";
import { Button } from "@/shared/components/ui/button";

export const providerHealthKey = ["provider-health"];

export function ProviderHealthNotice() {
  const health = useQuery({
    queryKey: providerHealthKey,
    queryFn: () => apiRequest<ProviderHealth>("/settings/provider-status"),
    enabled: localTransport,
    staleTime: 15000,
    refetchInterval: 30000,
    retry: false,
  });
  if (!localTransport || health.isPending || (health.data?.ok && !health.error))
    return null;
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-4 py-2 text-supporting"
    >
      <AlertCircle
        size={16}
        className="shrink-0 text-warning"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 basis-48 break-words">
        {health.error?.message ?? health.data?.message}
      </p>
      <Button asChild variant="ghost" size="sm">
        <Link to="/settings?section=providers">AI settings</Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={health.isFetching}
        onClick={() => void health.refetch()}
      >
        {health.isFetching ? "Checking…" : "Retry connection"}
      </Button>
    </div>
  );
}
