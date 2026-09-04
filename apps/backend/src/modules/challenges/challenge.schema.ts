import { z } from "zod";

export const challengeTypeSchema = z.enum([
  "exercise",
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

export const generateChallengeRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4_000),
});

export const challengeParamsSchema = z.object({
  id: z.string().uuid(),
});

export type Challenge = z.infer<typeof challengeSchema>;
export type ChallengeContent = z.infer<typeof challengeContentSchema>;
