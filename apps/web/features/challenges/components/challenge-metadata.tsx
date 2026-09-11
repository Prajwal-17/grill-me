import type { Challenge } from "../../../shared/types/api";
import { cn } from "../../../shared/lib/cn";
import { buildMetadata } from "../lib/challenge-formatters";

export function ChallengeMetadata({
  challenge,
  compact = false,
  className,
}: {
  challenge: Challenge;
  compact?: boolean;
  className?: string;
}) {
  const metadata = buildMetadata(challenge);
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label="Build details"
    >
      {metadata.map(({ label, value }) => (
        <span
          key={label}
          title={label}
          className={cn(
            "inline-flex items-center rounded-md border border-line bg-canvas text-muted",
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
          )}
        >
          <span className="sr-only">{label}: </span>
          {value}
          {label === "AI-estimated duration" && (
            <span className="ml-1">est.</span>
          )}
        </span>
      ))}
    </div>
  );
}
