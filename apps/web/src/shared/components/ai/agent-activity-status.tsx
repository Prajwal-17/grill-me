import { BrandMark } from "@/shared/components/brand";
import { StreamingStatus } from "./streaming-status";

export function AgentActivityStatus({
  label = "Thinking…",
}: {
  label?: string;
}) {
  return (
    <div className="space-y-2 py-2" aria-label="Grill Me activity">
      <div className="flex items-center gap-2 text-metadata font-medium text-muted">
        <BrandMark className="size-5" />
        <span>Grill Me</span>
      </div>
      <StreamingStatus label={label} />
    </div>
  );
}
