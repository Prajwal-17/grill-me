import { Clock3, Flame, type LucideIcon } from "lucide-react";
import type { Challenge } from "@/shared/types/api";
import { cn } from "@/shared/lib/cn";
import {
  EasyDifficultyIcon,
  HardDifficultyIcon,
  MediumDifficultyIcon,
} from "@/shared/components/difficulty-icons";
import { buildMetadata } from "@/features/challenges/lib/challenge-formatters";

const DIFFICULTY_ICONS: Record<Challenge["difficulty"], LucideIcon> = {
  easy: EasyDifficultyIcon,
  medium: MediumDifficultyIcon,
  hard: HardDifficultyIcon,
  grill: Flame,
};

export function ChallengeMetadata({
  challenge,
  compact = false,
  variant = "badges",
  className,
}: {
  challenge: Challenge;
  compact?: boolean;
  variant?: "badges" | "columns";
  className?: string;
}) {
  const metadata = buildMetadata(challenge);
  return (
    <div
      className={cn(
        variant === "columns"
          ? "grid items-center gap-x-4"
          : "flex flex-wrap items-center gap-2",
        className,
      )}
      aria-label="Build details"
    >
      {metadata.map(({ label, value }) => {
        const difficulty =
          challenge.estimatedDifficultyScore === null
            ? challenge.difficulty
            : challenge.contextualDifficulty;
        const DifficultyIcon = DIFFICULTY_ICONS[difficulty];
        return (
          <span
            key={label}
            title={label}
            data-difficulty={label === "Difficulty" ? difficulty : undefined}
            data-grill-badge={
              (label === "Difficulty" &&
                challenge.contextualDifficulty === "grill") ||
              undefined
            }
            className={cn(
              "inline-flex items-center rounded-md border border-line bg-canvas text-muted",
              label === "Scope" && "border-brand/25 bg-brand-soft text-brand",
              compact
                ? "px-1.5 py-0.5 text-metadata"
                : "px-2 py-1 text-metadata",
              variant === "columns" && "w-fit whitespace-nowrap",
              variant === "columns" &&
                label !== "Scope" &&
                "border-transparent bg-transparent px-0",
            )}
          >
            <span className="sr-only">{label}: </span>
            {label === "Difficulty" && (
              <DifficultyIcon size={12} className="mr-1" aria-hidden="true" />
            )}
            {label === "Estimated time" && (
              <Clock3 size={12} className="mr-1" aria-hidden="true" />
            )}
            {value}
          </span>
        );
      })}
    </div>
  );
}
