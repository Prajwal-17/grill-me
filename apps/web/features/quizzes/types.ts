export type QuestionCount = 5 | 10 | 15;
export type QuizCoverage = "challenge" | "related" | "mixed";
export type QuizAnswers = Record<string, number>;
export type QuizQuestion = { id: string; question: string; options: string[] };
export type QuizSummary = {
  id: string;
  challengeId: string;
  number: number;
  questionCount: number;
  coverage: QuizCoverage;
  createdAt: string;
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
};
export const COVERAGE_LABELS: Record<QuizCoverage, string> = {
  challenge: "Challenge",
  related: "Related concepts",
  mixed: "Mixed",
};
