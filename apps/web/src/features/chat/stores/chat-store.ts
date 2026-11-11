import type { BuildDifficulty, BuildScope } from "@/shared/types/api";
import { create } from "zustand";

type BuildStore = {
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  setPrompt: (prompt: string) => void;
  setScope: (scope: BuildScope) => void;
  setDifficulty: (difficulty: BuildDifficulty) => void;
  resetBuild: () => void;
};
const defaults = {
  prompt: "",
  scope: "focused" as BuildScope,
  difficulty: "medium" as BuildDifficulty,
};
export const useBuildStore = create<BuildStore>((set) => ({
  ...defaults,
  setPrompt: (prompt) => set({ prompt }),
  setScope: (scope) => set({ scope }),
  setDifficulty: (difficulty) => set({ difficulty }),
  resetBuild: () => set(defaults),
}));
