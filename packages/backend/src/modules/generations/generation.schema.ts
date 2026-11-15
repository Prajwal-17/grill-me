import { z } from "zod";
import { generateChallengeRequestSchema } from "../challenges/challenge.schema";
import {
  generateQuizRequestSchema,
  generateStandaloneQuizRequestSchema,
} from "../quizzes/quiz.schema";

export const generationRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("challenge"),
    requestId: z.string().uuid(),
    input: generateChallengeRequestSchema,
  }),
  z.object({
    kind: z.literal("quiz"),
    input: generateStandaloneQuizRequestSchema,
  }),
  z.object({
    kind: z.literal("challenge_quiz"),
    challengeId: z.string().uuid(),
    input: generateQuizRequestSchema,
  }),
]);

export const generationAnswerSchema = z.object({
  question: z.string().trim().min(5).max(240),
  answer: z.string().trim().min(1).max(2000),
});
export const generationRetrySchema = z.object({
  skipPreparation: z.boolean().default(false),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationError = {
  code: string;
  message: string;
  retryable: boolean;
};
export type GenerationRun = {
  id: string;
  token: string;
  signal?: AbortSignal;
  harness?: import("../harness/types").HarnessRunRequest;
};
