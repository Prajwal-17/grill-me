import { Clock3, Flame, type LucideIcon } from "lucide-react";
import type { Challenge } from "../../../shared/types/api";
import { cn } from "../../../shared/lib/cn";
import {
  EasyDifficultyIcon,
  HardDifficultyIcon,
  MediumDifficultyIcon,
} from "../../../shared/components/difficulty-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../shared/components/ui/tooltip";
import { buildMetadata } from "../lib/challenge-formatters";

const DIFFICULTY_ICONS: Record<Challenge["difficulty"], LucideIcon> = {
  easy: EasyDifficultyIcon,
  medium: MediumDifficultyIcon,
  hard: HardDifficultyIcon,
  grill: Flame,
};

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
      {metadata.map(({ label, value, help }) => {
        const DifficultyIcon = DIFFICULTY_ICONS[challenge.contextualDifficulty];
        const badge = (
          <span
            title={help ? undefined : label}
            aria-label={help ? `${label}: ${value}. ${help}` : undefined}
            data-grill-badge={
              (label === "Difficulty" &&
                challenge.contextualDifficulty === "grill") ||
              undefined
            }
            className={cn(
              "inline-flex items-center rounded-md border border-line bg-canvas text-muted",
              compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
            )}
          >
            <span className="sr-only">{label}: </span>
            {label === "Difficulty" && (
              <DifficultyIcon size={12} className="mr-1" aria-hidden="true" />
            )}
            {label === "AI-estimated duration" && (
              <Clock3 size={12} className="mr-1" aria-hidden="true" />
            )}
            {value}
            {label === "AI-estimated duration" && (
              <span className="ml-1">est.</span>
            )}
          </span>
        );
        return help ? (
          <Tooltip key={label}>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent sideOffset={7}>{help}</TooltipContent>
          </Tooltip>
        ) : (
          <span key={label}>{badge}</span>
        );
      })}
    </div>
  );
}
