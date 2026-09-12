import type {
  BuildDifficulty,
  BuildScope,
  Challenge,
  DurationEstimate,
} from "../../../shared/types/api";

export function formatBuildScope(scope: BuildScope) {
  return scope[0]!.toUpperCase() + scope.slice(1);
}

export function formatBuildDifficulty(difficulty: BuildDifficulty) {
  return difficulty[0]!.toUpperCase() + difficulty.slice(1);
}

function formatHours(minutes: number) {
  return String(minutes / 60);
}

export function formatDurationEstimate(estimate: DurationEstimate) {
  const { minMinutes, maxMinutes } = estimate;
  // Use hours only when both endpoints remain exact at half-hour precision.
  if (minMinutes >= 60 && minMinutes % 30 === 0 && maxMinutes % 30 === 0) {
    return minMinutes === maxMinutes
      ? `${formatHours(minMinutes)} hr`
      : `${formatHours(minMinutes)}–${formatHours(maxMinutes)} hr`;
  }
  return minMinutes === maxMinutes
    ? `${minMinutes} min`
    : `${minMinutes}–${maxMinutes} min`;
}

export function buildMetadata(challenge: Challenge) {
  return [
    { label: "Scope", value: formatBuildScope(challenge.scope) },
    {
      label: "Difficulty",
      value: formatBuildDifficulty(challenge.contextualDifficulty),
      help: "This difficulty is based on your context.",
    },
    {
      label: "AI-estimated duration",
      value: formatDurationEstimate(challenge.durationEstimate),
    },
  ];
}

export function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
