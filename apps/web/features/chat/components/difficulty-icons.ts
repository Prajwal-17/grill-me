import { createLucideIcon, type IconNode } from "lucide-react";

// Keep a full, readable silhouette at 14px; active bars show the difficulty.
const BARS = ["M5 20v-6", "M12 20V9", "M19 20V4"];

function difficultyIcon(name: string, level: 1 | 2 | 3) {
  return createLucideIcon(
    name,
    BARS.map<IconNode[number]>((d, index) => [
      "path",
      { d, opacity: index < level ? "1" : "0.24", key: d },
    ]),
  );
}

export const EasyDifficultyIcon = difficultyIcon("DifficultyEasy", 1);
export const MediumDifficultyIcon = difficultyIcon("DifficultyMedium", 2);
export const HardDifficultyIcon = difficultyIcon("DifficultyHard", 3);
