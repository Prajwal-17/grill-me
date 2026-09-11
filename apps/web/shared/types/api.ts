import type { GuidedPreferences, LegacyPreference } from "@repo/preferences";
export type Profile = {
  id: string;
  email: string;
  createdAt: string;
};

export type Difficulty = "easy" | "balanced" | "challenging";

export type ProfilePreferences = GuidedPreferences & {
  profileId: string;
  preferredDuration: 30 | 60 | 90;
  difficulty: Difficulty;
  aboutMe: string | null;
  updatedAt: string;
  legacyPreferences: LegacyPreference[];
};

export type ChallengeType =
  "exercise" | "question" | "architecture" | "mini-project";
export type ChallengeFormat = "auto" | ChallengeType;
export type ChallengeStatus = "active" | "completed";

export type Challenge = {
  id: string;
  profileId: string;
  title: string;
  type: ChallengeType;
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
