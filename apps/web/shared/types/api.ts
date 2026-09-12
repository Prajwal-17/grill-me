import type { GuidedPreferences } from "@repo/preferences";
export type Profile = {
  id: string;
  email: string;
  createdAt: string;
};

export type ProfilePreferences = GuidedPreferences & {
  profileId: string;
  aboutMe: string | null;
  updatedAt: string;
};

export type BuildScope = "focused" | "feature" | "system";
export type BuildDifficulty = "easy" | "medium" | "hard" | "grill";
export type DurationEstimate = {
  minMinutes: number;
  maxMinutes: number;
};

export type ChallengeType =
  "implementation" | "exercise" | "question" | "architecture" | "mini-project";
export type ChallengeStatus = "active" | "completed";

export type Challenge = {
  id: string;
  profileId: string;
  title: string;
  type: ChallengeType;
  scope: BuildScope | null;
  difficulty: BuildDifficulty | null;
  contextualDifficulty: BuildDifficulty | null;
  durationEstimate: DurationEstimate | null;
  implementationMilestones: string[] | null;
  problemStatement: string;
  expectedOutcome: string;
  constraints: string[];
  starterCode: string | null;
  completionCriteria: string[];
  hint: string | null;
  status: ChallengeStatus;
  createdAt: string;
  completedAt: string | null;
};

export type MessageMode = "generate" | "clarify" | "review" | "hint";

export type MessageAttachment = {
  filename: string;
  text: string;
};

export type ChatMessage = {
  id: string;
  challengeId: string;
  role: "user" | "assistant";
  mode: MessageMode;
  content: string;
  attachments: MessageAttachment[];
  createdAt: string;
};

export type ChallengePreparation = {
  question: string | null;
  options: string[];
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export type ClarificationContext = { question: string; answer: string };

export type GenerateBuildRequest = {
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarificationContext: ClarificationContext | null;
};
