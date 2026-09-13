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

export type ChallengeStatus = "active" | "paused" | "stopped" | "completed";

export type Challenge = {
  estimatedDifficultyScore: number | null;
  difficultyReason: string | null;
  topic: string | null;
  implementationBoundary: string | null;
  contextSnapshot: Record<string, unknown> | null;
  promptVersion: string | null;
  calibrationVersion: string | null;
  contractVersion: number;
  completionSource: "judge" | "legacy" | null;

  id: string;
  profileId: string;
  title: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  contextualDifficulty: BuildDifficulty;
  durationEstimate: DurationEstimate;
  implementationMilestones: string[];
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
  timeBudgetMinutes?: number | null;
  familiarity?: "new" | "practiced" | "comfortable" | null;
  emphasis?: string | null;

  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarificationContext: ClarificationContext | null;
};

export type ScoreDimension = { score: number | null; evidence: string };
export type ReviewResult = {
  verdict: "accepted" | "needs_revision" | "needs_evidence";
  summary: string;
  criteria: {
    id: string;
    status: "met" | "unmet" | "unassessed";
    evidence: string;
  }[];
  findings: {
    criterionId: string;
    location: string | null;
    issue: string;
    evidence: string;
  }[];
  optionalImprovements: string[];
  correctness: ScoreDimension;
  understanding: ScoreDimension;
  judgment: ScoreDimension;
  nextStep: string | null;
  question: string | null;
  verification: "checks_run" | "inspection_only" | "incomplete";
};
export type ReviewJob = {
  id: string;
  submissionId: string;
  judge: "omniroute" | "codex";
  routingReason: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: string;
  response: ReviewResult | null;
  score: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  followup: string | null;
};
export type PracticeSubmission = {
  id: string;
  challengeId: string;
  sequence: number;
  content: string;
  manifest: { path: string; bytes: number; sha256: string }[];
  assistance: { hints: number; guidance: boolean };
  createdAt: string;
  reviews: ReviewJob[];
};
export type ConnectedProject = { id: string; name: string; root: string };
export type TopicProgress = {
  challengeId: string;
  title: string;
  topic: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  score: number | null;
  accepted: boolean;
  assistance: { hints: number; guidance: boolean };
  createdAt: string;
  gaps: string[];
};
