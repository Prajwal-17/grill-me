import { z } from "zod";
import { modelSelectionSchema } from "@repo/contracts";
import { buildDifficultySchema } from "../challenges/challenge.schema";

export const questionCountSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
]);
export const quizCoverageSchema = z.enum(["challenge", "related", "mixed"]);
export const generateQuizRequestSchema = z.object({
  requestId: z.string().uuid(),
  questionCount: questionCountSchema,
  coverage: quizCoverageSchema.default("mixed"),
  selection: modelSelectionSchema.optional(),
});

export const generateStandaloneQuizRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    questionCount: questionCountSchema,
    prompt: z.string().trim().min(1).max(4000).optional(),
    // Continue accepting requests from the original topic-only client.
    topic: z.string().trim().min(1).max(200).optional(),
    difficulty: buildDifficultySchema.default("medium"),
    selection: modelSelectionSchema.optional(),
  })
  .refine((input) => input.prompt !== undefined || input.topic !== undefined, {
    message: "Enter a topic or describe the quiz you want.",
    path: ["prompt"],
  })
  .transform(({ prompt, topic, ...settings }) => ({
    ...settings,
    prompt: (prompt ?? topic)!,
  }));

export const enhanceQuizPromptRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  selection: modelSelectionSchema.optional(),
});

export const enhancedQuizPromptSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});

const questionSchema = z.object({
  question: z.string().trim().min(10).max(1800),
  options: z.array(z.string().trim().min(1).max(800)).length(4),
  correctOption: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(10).max(1200),
});

export const quizTitleSchema = z.string().trim().min(1).max(72);

export function generatedQuizSchema(count: QuestionCount) {
  return z.object({
    title: quizTitleSchema,
    questions: z.array(questionSchema).length(count),
  });
}

export const generatedQuizTitleSchema = z.object({ title: quizTitleSchema });

export function validateQuiz(value: unknown, count: QuestionCount) {
  // Keep accepting question-only output from existing model adapters while the
  // structured OpenAI response schema requires a title for new quiz generation.
  const parsed = z
    .object({
      title: quizTitleSchema.optional(),
      questions: z.array(questionSchema).length(count),
    })
    .parse(value);
  const normalized = (text: string) =>
    text.toLowerCase().replace(/\s+/g, " ").trim();
  if (
    new Set(parsed.questions.map((q) => normalized(q.question))).size !== count
  )
    throw new Error("Quiz questions must be distinct.");
  if (
    parsed.questions.some((q) => new Set(q.options.map(normalized)).size !== 4)
  )
    throw new Error("Each question needs four distinct choices.");
  return parsed;
}

export const saveQuizAnswersSchema = z.object({
  revision: z.number().int().nonnegative(),
  answers: z
    .record(z.string().uuid(), z.number().int().min(0).max(3))
    .refine(
      (answers) => Object.keys(answers).length <= 15,
      "Too many answers.",
    ),
});

export type QuestionCount = z.infer<typeof questionCountSchema>;
export type QuizCoverage = z.infer<typeof quizCoverageSchema>;
export type GeneratedQuiz = {
  title?: string;
  questions: z.infer<typeof questionSchema>[];
};
export type QuizQuestion = z.infer<typeof questionSchema> & { id: string };
export type QuizAnswers = Record<string, number>;
export type GenerateQuizRequest = z.infer<typeof generateQuizRequestSchema>;
export type GenerateStandaloneQuizRequest = z.infer<
  typeof generateStandaloneQuizRequestSchema
>;
export type EnhanceQuizPromptRequest = z.infer<
  typeof enhanceQuizPromptRequestSchema
>;
export type SaveQuizAnswers = z.infer<typeof saveQuizAnswersSchema>;
