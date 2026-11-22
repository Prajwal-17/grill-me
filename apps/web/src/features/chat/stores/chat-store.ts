import type { BuildDifficulty, BuildScope } from "@/shared/types/api";
import { create } from "zustand";

/** "auto" lets the model judge the scope from the request. */
export type ScopeChoice = BuildScope | "auto";

type BuildStore = {
  prompt: string;
  scope: ScopeChoice;
  difficulty: BuildDifficulty;
  setPrompt: (prompt: string) => void;
  setScope: (scope: ScopeChoice) => void;
  setDifficulty: (difficulty: BuildDifficulty) => void;
  resetBuild: () => void;
};
const defaults = {
  prompt: "",
  scope: "focused" as ScopeChoice,
  difficulty: "medium" as BuildDifficulty,
};
export const useBuildStore = create<BuildStore>((set) => ({
  ...defaults,
  setPrompt: (prompt) => set({ prompt }),
  setScope: (scope) => set({ scope }),
  setDifficulty: (difficulty) => set({ difficulty }),
  resetBuild: () => set(defaults),
}));
