"use client";

import type {
  BuildDifficulty,
  BuildScope,
  ChallengePreparation,
  ClarificationContext,
  MessageAttachment,
} from "@/shared/types/api";
import type { ComposerMode } from "@/features/chat/api/message-api";
import type { Submission, WorkspaceTab } from "@/features/chat/types/workspace";
import { create } from "zustand";

type BuildStore = {
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarification: ChallengePreparation | null;
  choice: string;
  custom: string;
  ready: boolean;
  lastAnswer: ClarificationContext | null;
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
};

const flowDefaults = {
  clarification: null,
  choice: "",
  custom: "",
  ready: false,
  lastAnswer: null,
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
  resetFlow: () => set(flowDefaults),
  resetBuild: () => set(buildDefaults),
}));

type StreamedReply = {
  content: string;
  mode: ComposerMode | "hint";
};

type WorkspaceStore = {
  tab: WorkspaceTab;
  solution: string;
  solutionFiles: MessageAttachment[];
  question: string;
  pending: Submission | null;
  reply: StreamedReply | null;
  setTab: (tab: WorkspaceTab) => void;
  setSolution: (solution: string) => void;
  setSolutionFiles: (solutionFiles: MessageAttachment[]) => void;
  setQuestion: (question: string) => void;
  setPending: (pending: Submission | null) => void;
  setReply: (reply: StreamedReply | null) => void;
  appendReply: (mode: StreamedReply["mode"], delta: string) => void;
  returnToDraft: () => void;
  resetWorkspace: () => void;
};

const workspaceDefaults = {
  tab: "statement" as WorkspaceTab,
  solution: "",
  solutionFiles: [] as MessageAttachment[],
  question: "",
  pending: null,
  reply: null,
};

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  ...workspaceDefaults,
  setTab: (tab) => set({ tab }),
  setSolution: (solution) => set({ solution }),
  setSolutionFiles: (solutionFiles) => set({ solutionFiles }),
  setQuestion: (question) => set({ question }),
  setPending: (pending) => set({ pending }),
  setReply: (reply) => set({ reply }),
  appendReply: (mode, delta) =>
    set((state) => ({
      reply: { mode, content: (state.reply?.content ?? "") + delta },
    })),
  returnToDraft: () =>
    set((state) => ({ tab: state.tab === "review" ? "solution" : state.tab })),
  resetWorkspace: () => set(workspaceDefaults),
}));
