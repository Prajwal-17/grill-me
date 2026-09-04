export type Profile = {
  id: string;
  email: string;
  createdAt: string;
};

export type ChallengeType = "exercise" | "architecture" | "mini-project";
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

export type ChatMessage = {
  id: string;
  challengeId: string;
  role: "user" | "assistant";
  mode: MessageMode;
  content: string;
  createdAt: string;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};
