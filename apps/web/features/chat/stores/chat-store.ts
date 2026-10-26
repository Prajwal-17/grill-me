"use client";

import type {
  BuildDifficulty,
  BuildScope,
  ChallengePreparation,
  ClarificationContext,
} from "@/shared/types/api";
import { create } from "zustand";

export type BuildStore = {
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarification: ChallengePreparation | null;
  choice: string;
  custom: string;
  ready: boolean;
  lastAnswer: ClarificationContext | null;
  clarificationHistory: ClarificationContext[];
  setClarificationHistory: (history: ClarificationContext[]) => void;
  setPrompt: (prompt: string) => void;
  setScope: (scope: BuildScope) => void;
  setDifficulty: (difficulty: BuildDifficulty) => void;
  setClarification: (clarification: ChallengePreparation | null) => void;
  setChoice: (choice: string) => void;
  setCustom: (custom: string) => void;
  setReady: (ready: boolean) => void;
  setLastAnswer: (lastAnswer: ClarificationContext | null) => void;
  resetFlow: () => void;
  resetBuild: () => void;
};

const buildDefaults = {
  prompt: "",
  scope: "focused" as BuildScope,
  difficulty: "medium" as BuildDifficulty,
  clarification: null,
  choice: "",
  custom: "",
  ready: false,
  lastAnswer: null,
  clarificationHistory: [] as ClarificationContext[],
};

const flowDefaults = {
  clarification: null,
  choice: "",
  custom: "",
  ready: false,
  lastAnswer: null,
  clarificationHistory: [] as ClarificationContext[],
};

export const useBuildStore = create<BuildStore>((set) => ({
  ...buildDefaults,
  setPrompt: (prompt) => set({ prompt }),
  setScope: (scope) => set({ scope }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setClarification: (clarification) => set({ clarification }),
  setChoice: (choice) => set({ choice }),
  setCustom: (custom) => set({ custom }),
  setReady: (ready) => set({ ready }),
  setLastAnswer: (lastAnswer) => set({ lastAnswer }),
  setClarificationHistory: (clarificationHistory) =>
    set({ clarificationHistory }),
  resetFlow: () => set(flowDefaults),
  resetBuild: () => set(buildDefaults),
}));
