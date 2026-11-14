import type {
  ReviewResult,
  VerificationEvidence,
  VerificationPlan,
} from "../reviews/review.schema";
import type {
  BuildDifficulty,
  BuildScope,
  Challenge,
  ClarificationContext,
  ChallengePreparation,
  GeneratedBuildContent,
  BuildGenerationResult,
} from "../challenges/challenge.schema";
import type {
  ChatMessage,
  MessageAttachment,
} from "../messages/message.schema";
import type {
  ModelSelection,
  ProjectCommand,
  ProjectFrozenSpecification,
  ProjectPreparationStatus,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import type { ProfilePreferences } from "../profiles/profile.schema";
import type { ProjectLayout } from "../challenges/project-workspace";
import type { ProjectToolActivity } from "./agent/tools/project";
import type { ProjectCommandExecutor } from "../challenges/project-command.types";
import type {
  GeneratedQuiz,
  QuestionCount,
  QuizCoverage,
} from "../quizzes/quiz.schema";

export type QuizModelInput = {
  signal?: AbortSignal;
  selection?: ModelSelection;
  questionCount: QuestionCount;
  previousQuestions: string[];
} & (
  | { challenge: Challenge; coverage: QuizCoverage }
  | {
      challenge: null;
      profileId: string;
      prompt: string;
      difficulty: BuildDifficulty;
      preferences: ProfilePreferences;
      coverage: "topic";
    }
);

export type QuizTitleModelInput = {
  profileId: string;
  challengeId: string | null;
  selection?: ModelSelection;
  source: string;
  currentTitle: string;
  questionCount: QuestionCount;
  difficulty: BuildDifficulty | null;
  coverage: QuizCoverage | "topic";
  questions: string[];
};

export type ConversationMode = "clarify" | "review";

export type LearnerContext = {
  recentEvidence?: Awaited<
    ReturnType<
      typeof import("../reviews/learning-evidence").recentLearningEvidence
    >
  >;
  profileId: string;
  preferences: ProfilePreferences;
  recentChallenges: {
    title: string;
    scope: Challenge["scope"];
    contextualDifficulty: Challenge["contextualDifficulty"];
    summary: string;
  }[];
};

export type BuildModelInput = {
  signal?: AbortSignal;
  selection?: ModelSelection;
  timeBudgetMinutes?: number | null;
  familiarity?: "new" | "practiced" | "comfortable" | null;
  emphasis?: string | null;
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarificationContext: ClarificationContext | null;
  learner: LearnerContext;
  clarificationHistory?: ClarificationContext[];
  calibrationFeedback?: {
    selectedDifficulty: BuildDifficulty;
    estimatedBand: BuildDifficulty;
    reason: string;
    previousChallenge: GeneratedBuildContent;
  };
};

export type ProjectScaffoldPreviousAttempt = {
  attempt: number;
  status: ProjectPreparationStatus;
  projectDirectory: string;
  projectPath: string;
  summary: string | null;
  todos: { path: string; line: number; note: string }[];
  problems: string[];
  error: { code: string; message: string } | null;
};

export type ProjectScaffoldContinuation = {
  /** The new run continues the same existing project folder. */
  resumedFromAttempt: number;
  /** Journaled files that were absent when resume started. */
  missingFiles: string[];
  missingFileCount: number;
};

export type ProjectScaffoldModelInput = {
  profileId: string;
  challengeId: string;
  selection?: ModelSelection;
  signal?: AbortSignal;
  /** Discovered frozen specification, stable for this attempt. */
  specification: ProjectFrozenSpecification;
  /** Attempt layout, including the project tools root and journal location. */
  layout: ProjectLayout;
  previousAttempt: ProjectScaffoldPreviousAttempt | null;
  /** Present only when this run continues the same existing project folder. */
  continuation?: ProjectScaffoldContinuation | null;
  /** Best-effort progress reporting persisted by the preparation service. */
  onActivity?: (activity: ProjectToolActivity) => void | Promise<void>;
  /**
   * Task-scoped authorized command execution. Only the scaffold task receives
   * this capability; review and conversational tasks never do.
   */
  runProjectCommand?: ProjectCommandExecutor;
  /** Persisted command executions used to validate honest check results. */
  commandResults?: () => Promise<ProjectCommand[]>;
};

export type JudgeInput = {
  workspace?: string;
  codexModel?: string;
  selection?: ModelSelection;
  challenge: Challenge;
  content: string;
  attachments: MessageAttachment[];
  evidence: VerificationEvidence;
  assistance: { hints: number; guidance: boolean };
  followup?: string | null;
  previousReview?: ReviewResult | null;
  reviewCorrection?: { error: string; rejectedReview: unknown };
  signal?: AbortSignal;
};
export interface ModelGateway {
  reviewWorkspace?(
    input: JudgeInput,
    workspace: string,
    manifest: import("../projects/snapshot").Manifest,
  ): Promise<ReviewResult>;
  enhanceBuildPrompt?(input: {
    profileId: string;
    prompt: string;
    selection?: ModelSelection;
  }): Promise<{ prompt: string }>;
  extractResume?(input: {
    profileId: string;
    text: string;
    signal?: AbortSignal;
    selection?: ModelSelection;
  }): Promise<unknown>;
  generateQuiz?(input: QuizModelInput): Promise<GeneratedQuiz>;
  generateQuizTitle?(input: QuizTitleModelInput): Promise<string>;
  enhanceQuizPrompt?(input: {
    profileId: string;
    prompt: string;
    selection?: ModelSelection;
  }): Promise<{ prompt: string }>;
  judge?(input: JudgeInput): Promise<ReviewResult>;
  planVerification?(input: JudgeInput): Promise<VerificationPlan>;

  prepareBuild(
    input: Omit<BuildModelInput, "clarificationContext">,
  ): Promise<ChallengePreparation>;
  generateBuild(input: BuildModelInput): Promise<BuildGenerationResult>;
  scaffoldProject?(
    input: ProjectScaffoldModelInput,
  ): Promise<ProjectScaffoldReport>;
  respond(input: {
    signal?: AbortSignal;
    selection?: ModelSelection;
    challenge: Challenge;
    messages: ChatMessage[];
    content: string;
    mode: ConversationMode;
    attachments: MessageAttachment[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
  generateHint(input: {
    helpKind?: "hint" | "approach";
    selection?: ModelSelection;
    challenge: Challenge;
    messages: ChatMessage[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
}
