import type {
  ChallengeWorkspace,
  ModelSelection,
  ProjectCheckProposal,
  ProjectCheckResult,
  ProjectCommandProposal,
  ProjectPreparation,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import type { GuidedPreferences } from "@repo/backend/shared/preferences";
export type {
  ChallengeWorkspace,
  ModelSelection,
  ProjectCheckProposal,
  ProjectCheckResult,
  ProjectCommandProposal,
  ProjectPreparation,
  ProjectScaffoldReport,
};
export type Profile = {
  id: string;
  email: string;
  createdAt: string;
};

export type ProfilePreferences = GuidedPreferences & {
  profileId: string;
  aboutMe: string | null;
  updatedAt: string;
  developerContextUpdatedAt: string | null;
};

export type BuildScope = "focused" | "feature" | "system";
export type BuildDifficulty = "easy" | "medium" | "hard" | "grill";
export type DurationEstimate = {
  minMinutes: number;
  maxMinutes: number;
};

export type ChallengeStatus =
  "active" | "paused" | "saved" | "stopped" | "completed";

export type Challenge = {
  estimatedDifficultyScore: number | null;
  difficultyReason: string | null;
  topic: string | null;
  implementationBoundary: string | null;
  contextSnapshot: Record<string, unknown> | null;
  promptVersion: string | null;

  id: string;
  profileId: string;
  number: number;
  title: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  contextualDifficulty: BuildDifficulty;
  durationEstimate: DurationEstimate;
  implementationMilestones: string[];
  problemStatement: string;
  expectedOutcome: string;
  completionCriteria: string[];
  hint: string | null;
  workspacePath: string | null;
  status: ChallengeStatus;
  archivedAt: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type MessageMode = "generate" | "clarify" | "review" | "hint";

export type MessageAttachment = {
  filename: string;
  text: string;
  mimeType?: string;
  data?: string;
};

export type ChatMessage = {
  status?: "streaming" | "completed" | "failed" | "cancelled" | "interrupted";
  error?: string | null;
  replyTo?: string | null;
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
    details?: Record<string, unknown>;
  };
};

export type ClarificationContext = { question: string; answer: string };

export type GenerateBuildRequest = {
  timeBudgetMinutes?: number | null;
  familiarity?: "new" | "practiced" | "comfortable" | null;
  emphasis?: string | null;

  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarificationContext: ClarificationContext | null;
  clarificationHistory?: ClarificationContext[];
  selection?: ModelSelection;
};
