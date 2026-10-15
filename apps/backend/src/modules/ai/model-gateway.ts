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
} from "../challenges/challenge.schema";
import type {
  ChatMessage,
  MessageAttachment,
} from "../messages/message.schema";
import type { ProfilePreferences } from "../profiles/profile.schema";
import type {
  GeneratedQuiz,
  QuestionCount,
  QuizCoverage,
} from "../quizzes/quiz.schema";

export type QuizModelInput = {
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
  timeBudgetMinutes?: number | null;
  familiarity?: "new" | "practiced" | "comfortable" | null;
  emphasis?: string | null;
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarificationContext: ClarificationContext | null;
  learner: LearnerContext;
};

export type JudgeInput = {
  codexModel?: string;
  challenge: Challenge;
  content: string;
  attachments: MessageAttachment[];
  evidence: VerificationEvidence;
  assistance: { hints: number; guidance: boolean };
  followup?: string | null;
  previousReview?: ReviewResult | null;
  signal?: AbortSignal;
};
export interface ModelGateway {
  generateQuiz?(input: QuizModelInput): Promise<GeneratedQuiz>;
  judge?(input: JudgeInput): Promise<ReviewResult>;
  planVerification?(input: JudgeInput): Promise<VerificationPlan>;

  prepareBuild(
    input: Omit<BuildModelInput, "clarificationContext">,
  ): Promise<ChallengePreparation>;
  generateBuild(input: BuildModelInput): Promise<GeneratedBuildContent>;
  respond(input: {
    challenge: Challenge;
    messages: ChatMessage[];
    content: string;
    mode: ConversationMode;
    attachments: MessageAttachment[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
  generateHint(input: {
    helpKind?: "hint" | "approach";
    challenge: Challenge;
    messages: ChatMessage[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
}
