import { Flame } from "lucide-react";
import {
  EasyDifficultyIcon,
  HardDifficultyIcon,
  MediumDifficultyIcon,
} from "@/shared/components/difficulty-icons";
export const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    icon: EasyDifficultyIcon,
  },
  {
    id: "medium",
    label: "Medium",
    icon: MediumDifficultyIcon,
  },
  {
    id: "hard",
    label: "Hard",
    icon: HardDifficultyIcon,
  },
  {
    id: "grill",
    label: "Grill",
    icon: Flame,
    accent: "grill",
  },
] as const;
