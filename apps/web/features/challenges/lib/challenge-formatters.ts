import type { ChallengeType } from "../../../shared/types/api";

export function formatChallengeType(type: ChallengeType) {
  if (type === "mini-project") return "Mini-project";
  if (type === "exercise") return "Coding exercise";
  if (type === "question") return "Tricky question";
  return type[0]!.toUpperCase() + type.slice(1);
}

export function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
