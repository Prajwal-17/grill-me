import { z } from "zod";

export const challengeTypeSchema = z.enum([
  "exercise",
  "question",
  "architecture",
  "mini-project",
]);

export const challengeFormatSchema = z.enum([
  "auto",
  "exercise",
  "question",
  "architecture",
  "mini-project",
]);

export const challengeContentSchema = z.object({
  title: z.string().min(3).max(120),
  type: challengeTypeSchema,
  problemStatement: z.string().min(20),
  expectedOutcome: z.string().min(10),
  constraints: z.array(z.string().min(1)).min(1).max(8),
  starterCode: z.string().nullable(),
  completionCriteria: z.array(z.string().min(1)).min(1).max(8),
});

export const challengeSchema = challengeContentSchema.extend({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  hint: z.string().nullable(),
  status: z.enum(["active", "completed"]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export const prepareChallengeRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4_000),
  format: challengeFormatSchema.default("auto"),
});

export const generateChallengeRequestSchema =
  prepareChallengeRequestSchema.extend({
    clarificationContext: z.string().trim().max(2_000).nullable().default(null),
  });

export const challengePreparationSchema = z.object({
  question: z.string().trim().min(5).max(240).nullable(),
});

export const challengeParamsSchema = z.object({
  id: z.string().uuid(),
});

export type Challenge = z.infer<typeof challengeSchema>;
export type ChallengeContent = z.infer<typeof challengeContentSchema>;
export type ChallengeFormat = z.infer<typeof challengeFormatSchema>;
export type ChallengePreparation = z.infer<typeof challengePreparationSchema>;
export type GenerateChallengeInput = z.infer<
  typeof generateChallengeRequestSchema
>;
