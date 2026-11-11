import type { ModelSelection } from "@repo/backend/shared/contracts";
export type QuestionCount = number;
export type QuizCoverage = "challenge" | "related" | "mixed";
export type QuizDifficulty = "easy" | "medium" | "hard" | "grill";
export type QuizAnswers = Record<string, number>;
export type QuizQuestion = { id: string; question: string; options: string[] };
export type QuizSummary = {
  id: string;
  challengeId: string | null;
  title: string;
  topic: string | null;
  prompt: string | null;
  difficulty: QuizDifficulty | null;
  number: number;
  questionCount: number;
  coverage: QuizCoverage | "topic";
  createdAt: string;
  deletedAt?: string | null;
  latestAttempt: {
    number: number;
    status: "draft" | "submitted";
    answered: number;
    score: number | null;
  } | null;
};
export type Quiz = Omit<QuizSummary, "latestAttempt"> & {
  questions: QuizQuestion[];
};
export type QuizAttempt = {
  id: string;
  quizId: string;
  number: number;
  status: "draft" | "submitted";
  answers: QuizAnswers;
  revision: number;
  score: number | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  results:
    | {
        questionId: string;
        chosenOption: number;
        correctOption: number;
        explanation: string;
      }[]
    | null;
};
export type QuizDetail = { quiz: Quiz; attempts: QuizAttempt[] };
export type GenerateQuizRequest = {
  requestId: string;
  questionCount: QuestionCount;
  coverage: QuizCoverage;
  selection?: ModelSelection;
};
export type GenerateStandaloneQuizRequest = {
  requestId: string;
  questionCount: QuestionCount;
  prompt: string;
  difficulty: QuizDifficulty;
  selection?: ModelSelection;
};
export const COVERAGE_LABELS: Record<QuizCoverage, string> = {
  challenge: "Challenge",
  related: "Related concepts",
  mixed: "Mixed",
};
