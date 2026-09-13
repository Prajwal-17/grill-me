import { z } from "zod";

export const buildScopeSchema = z.enum(["focused", "feature", "system"]);
export const buildDifficultySchema = z.enum([
  "easy",
  "medium",
  "hard",
  "grill",
]);

// One source for structured-output limits and runtime validation.
export const BUILD_SCOPE_LIMITS = {
  focused: { statement: 1_600, minMilestones: 0, maxMilestones: 0 },
  feature: { statement: 3_000, minMilestones: 0, maxMilestones: 7 },
  system: { statement: 5_000, minMilestones: 0, maxMilestones: 7 },
} as const;

export const durationEstimateSchema = z
  .object({
    minMinutes: z.number().int().positive(),
    maxMinutes: z.number().int().positive(),
  })
  .refine((value) => value.minMinutes <= value.maxMinutes, {
    path: ["maxMinutes"],
    message: "Maximum duration must be at least the minimum duration.",
  });

export const familiaritySchema = z.enum(["new", "practiced", "comfortable"]);
export const learningContextSchema = z.object({
  timeBudgetMinutes: z.number().int().positive().nullable().default(null),
  familiarity: familiaritySchema.nullable().default(null),
  emphasis: z.string().trim().max(300).nullable().default(null),
});

const milestoneSchema = z.string().trim().min(1).max(300);

export const generatedBuildContentSchema = z.object({
  title: z.string().min(3).max(120),
  contextualDifficulty: buildDifficultySchema,
  estimatedDifficultyScore: z.number().int().min(1).max(10),
  difficultyReason: z.string().trim().min(1).max(400),
  topic: z.string().trim().min(1).max(200),
  implementationBoundary: z.string().trim().max(800),
  problemStatement: z.string().min(20).max(5_000),
  expectedOutcome: z.string().min(10),
  constraints: z.array(z.string().min(1)).max(8),
  starterCode: z.string().nullable(),
  completionCriteria: z.array(z.string().min(1)).min(1).max(8),
  durationEstimate: durationEstimateSchema,
  implementationMilestones: z.array(milestoneSchema).max(7),
});

export function generatedBuildSchemaForScope(scope: BuildScope) {
  const limits = BUILD_SCOPE_LIMITS[scope];
  return generatedBuildContentSchema.extend({
    problemStatement: z.string().min(20).max(limits.statement),
    completionCriteria: z
      .array(z.string().trim().min(1).max(320))
      .min(1)
      .max(scope === "focused" ? 4 : scope === "feature" ? 6 : 8),
    constraints: z.array(z.string().trim().min(1).max(220)).max(4),
    expectedOutcome: z.string().trim().min(10).max(240),
    implementationBoundary: z.string().trim().max(450),
    implementationMilestones: z
      .array(milestoneSchema)
      .min(limits.minMilestones)
      .max(limits.maxMilestones),
  });
}

export const challengeContentSchema = generatedBuildContentSchema.extend({
  scope: buildScopeSchema,
  difficulty: buildDifficultySchema,
});

export const challengeSchema = challengeContentSchema.extend({
  estimatedDifficultyScore: z
    .number()
    .int()
    .min(1)
    .max(10)
    .nullable()
    .default(null),
  difficultyReason: z.string().nullable().default(null),
  topic: z.string().nullable().default(null),
  implementationBoundary: z.string().nullable().default(null),
  contextSnapshot: z.record(z.string(), z.unknown()).nullable().default(null),
  promptVersion: z.string().nullable().default(null),
  calibrationVersion: z.string().nullable().default(null),
  contractVersion: z.number().int().default(1),
  completionSource: z
    .enum(["judge", "legacy", "user"])
    .nullable()
    .default(null),
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  hint: z.string().nullable(),
  status: z.enum(["active", "paused", "saved", "stopped", "completed"]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

const buildRequestSchema = z.object({
  ...learningContextSchema.shape,
  prompt: z.string().trim().min(3).max(4_000),
  scope: buildScopeSchema,
  difficulty: buildDifficultySchema,
});

export const prepareChallengeRequestSchema = buildRequestSchema;

export const clarificationContextSchema = z.object({
  question: z.string().trim().min(5).max(240),
  answer: z.string().trim().min(1).max(2000),
});
export type ClarificationContext = z.infer<typeof clarificationContextSchema>;

export const generateChallengeRequestSchema = buildRequestSchema.extend({
  clarificationContext: clarificationContextSchema.nullable().default(null),
});

export const challengePreparationSchema = z
  .object({
    question: z.string().trim().min(5).max(240).nullable(),
    options: z.array(z.string().trim().min(1).max(160)).max(3),
  })
  .refine(
    (value) =>
      value.question === null
        ? value.options.length === 0
        : value.options.length >= 2 &&
          new Set(value.options.map((option) => option.toLowerCase())).size ===
            value.options.length,
    {
      path: ["options"],
      message:
        "A clarification needs 2–3 distinct choices; no question needs no choices.",
    },
  );

export const challengeParamsSchema = z.object({
  id: z.string().uuid(),
});

export type Challenge = z.infer<typeof challengeSchema>;
export type ChallengeContent = z.infer<typeof challengeContentSchema>;
export type GeneratedBuildContent = z.infer<typeof generatedBuildContentSchema>;
export type BuildScope = z.infer<typeof buildScopeSchema>;
export type BuildDifficulty = z.infer<typeof buildDifficultySchema>;
export type DurationEstimate = z.infer<typeof durationEstimateSchema>;
export type ChallengePreparation = z.infer<typeof challengePreparationSchema>;
export type GenerateChallengeInput = z.infer<
  typeof generateChallengeRequestSchema
>;
export type GenerateBuildRequest = GenerateChallengeInput;
