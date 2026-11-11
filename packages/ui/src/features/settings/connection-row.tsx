import { Trash2 } from "lucide-react";
import type { SavedProvider } from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import { presetNames } from "./provider-options";

export function ConnectionRow({
  provider,
  active,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  provider: SavedProvider;
  active: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggle: (value: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onEdit}
        aria-label={`Edit ${provider.name}`}
      >
        <span className="flex flex-wrap items-center gap-2 text-ui font-medium">
          {provider.name}
          {active && (
            <span className="text-metadata font-normal text-muted">In use</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-supporting text-muted">
          {presetNames[provider.preset]} · {provider.model || "No model"}
        </span>
      </button>
      <Switch
        aria-label={`Enable ${provider.name}`}
        checked={provider.enabled}
        disabled={busy}
        onCheckedChange={onToggle}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${provider.name}`}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}
