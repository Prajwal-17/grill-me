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
  AgentPermissionMode,
  ChallengeReviewResult,
  ModelSelection,
  ProjectCommand,
  ProjectFrozenSpecification,
  ProjectPreparationStatus,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";
import type { HarnessRunRequest } from "../harness/types";
import type { PermissionAsk } from "./agent/permission-policy";
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
  harness?: HarnessRunRequest;
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
      attachments?: MessageAttachment[];
    }
);

export type QuizTitleModelInput = {
  profileId: string;
  challengeId: string | null;
  selection?: ModelSelection;
  harness?: HarnessRunRequest;
  source: string;
  currentTitle: string;
  questionCount: QuestionCount;
  difficulty: BuildDifficulty | null;
  coverage: QuizCoverage | "topic";
  questions: string[];
};

export type ConversationMode = "clarify";

export type LearnerContext = {
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
  harness?: HarnessRunRequest;
  timeBudgetMinutes?: number | null;
  familiarity?: "new" | "practiced" | "comfortable" | null;
  emphasis?: string | null;
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  attachments?: MessageAttachment[];
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
  harness?: HarnessRunRequest;
  permissionMode?: AgentPermissionMode;
  requestPermission?: PermissionAsk;
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
   * this capability; conversational tasks never do.
   */
  runProjectCommand?: ProjectCommandExecutor;
  /** Ask a blocking question through the current preparation transcript. */
  requestUserInput?: (
    question: string,
    signal?: AbortSignal,
  ) => Promise<string | null>;
  /** Persisted command executions used to validate honest check results. */
  commandResults?: () => Promise<ProjectCommand[]>;
};

export type ReviewModelInput = {
  profileId: string;
  challengeId: string;
  challenge: Challenge;
  workspacePath: string;
  selection?: ModelSelection;
  signal?: AbortSignal;
  harness?: HarnessRunRequest;
};

export type ScopeResolutionInput = {
  prompt: string;
  learner: LearnerContext;
  selection?: ModelSelection;
  signal?: AbortSignal;
  harness?: HarnessRunRequest;
};

export interface ModelGateway {
  enhanceBuildPrompt?(input: {
    profileId: string;
    prompt: string;
    selection?: ModelSelection;
    harness?: HarnessRunRequest;
  }): Promise<{ prompt: string }>;
  extractResume?(input: {
    profileId: string;
    text: string;
    signal?: AbortSignal;
    selection?: ModelSelection;
    harness?: HarnessRunRequest;
  }): Promise<unknown>;
  generateQuiz?(input: QuizModelInput): Promise<GeneratedQuiz>;
  generateQuizTitle?(input: QuizTitleModelInput): Promise<string>;
  enhanceQuizPrompt?(input: {
    profileId: string;
    prompt: string;
    selection?: ModelSelection;
    harness?: HarnessRunRequest;
  }): Promise<{ prompt: string }>;

  reviewChallenge?(input: ReviewModelInput): Promise<ChallengeReviewResult>;
  prepareBuild(
    input: Omit<BuildModelInput, "clarificationContext">,
  ): Promise<ChallengePreparation>;
  generateBuild(input: BuildModelInput): Promise<BuildGenerationResult>;
  /** Chooses focused, feature, or system when the engineer selected Auto. */
  resolveBuildScope?(
    input: ScopeResolutionInput,
  ): Promise<{ scope: BuildScope }>;
  scaffoldProject?(
    input: ProjectScaffoldModelInput,
  ): Promise<ProjectScaffoldReport>;
  respond(input: {
    signal?: AbortSignal;
    selection?: ModelSelection;
    harness?: HarnessRunRequest;
    challenge: Challenge;
    messages: ChatMessage[];
    content: string;
    mode: ConversationMode;
    attachments: MessageAttachment[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
  generateHint(input: {
    signal?: AbortSignal;
    helpKind?: "hint" | "approach";
    selection?: ModelSelection;
    harness?: HarnessRunRequest;
    challenge: Challenge;
    messages: ChatMessage[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
}
