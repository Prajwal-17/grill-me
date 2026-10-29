import { z } from "zod";
import {
  DEFAULT_CODEX_MODEL,
  EXPERIENCE,
  LANGUAGES,
  STACK,
  GOALS,
  FOCUS,
  optionIds,
  normalizeTechnologies,
  mergeProjects,
} from "@repo/preferences";
export const profileIdSchema = z.string().uuid();
export const startProfileRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});
export const profileSchema = z.object({
  id: profileIdSchema,
  email: z.email(),
  createdAt: z.string(),
});
function unique<T>(values: T[]) {
  return [...new Set(values)];
}
export const guidedPreferencesSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .default(null)
    .transform((value) => value || null),
  projects: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        technologies: z
          .array(z.string().trim().min(1).max(80))
          .max(20)
          .transform((values) => normalizeTechnologies(values)),
        contribution: z.string().trim().min(1).max(600),
      }),
    )
    .max(10)
    .default([])
    .transform((values) => mergeProjects([], values)),
  codexModel: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/)
    .default(DEFAULT_CODEX_MODEL),
  includeRecentChallenges: z.boolean().default(false),
  topicFamiliarity: z
    .array(
      z.object({
        topic: z.string().trim().min(1).max(200),
        familiarity: z.enum(["new", "practiced", "comfortable"]),
      }),
    )
    .default([]),
  knownConcepts: z.array(z.string().trim().min(1).max(200)).default([]),
  learningGoal: z.string().trim().max(1000).nullable().default(null),
  experienceLevel: z.enum(optionIds(EXPERIENCE)).nullable().default(null),
  languages: z
    .array(z.string().trim().min(1).max(80))
    .max(50)
    .default([])
    .transform((values) => normalizeTechnologies(values, LANGUAGES)),
  stack: z
    .array(z.string().trim().min(1).max(80))
    .max(50)
    .default([])
    .transform((values) => normalizeTechnologies(values, STACK)),
  learningGoals: z
    .array(z.enum(optionIds(GOALS)))
    .max(GOALS.length)
    .default([])
    .transform(unique),
  currentFocus: z.enum(optionIds(FOCUS)).nullable().default(null),
});
const editablePreferencesSchema = guidedPreferencesSchema.extend({
  aboutMe: z
    .string()
    .trim()
    .max(4_000)
    .nullable()
    .default(null)
    .transform((value) => value || null),
});
// Put undefined first: defaults nested inside optional schemas otherwise reset
// omitted fields in Zod 4. Older and partial clients must preserve saved values.
const optionalField = <T extends z.ZodType>(schema: T) =>
  z.union([z.undefined(), schema]).optional();
export const savePreferencesRequestSchema = z.object({
  displayName: optionalField(editablePreferencesSchema.shape.displayName),
  projects: optionalField(editablePreferencesSchema.shape.projects),
  codexModel: optionalField(editablePreferencesSchema.shape.codexModel),
  includeRecentChallenges: optionalField(
    editablePreferencesSchema.shape.includeRecentChallenges,
  ),
  topicFamiliarity: optionalField(
    editablePreferencesSchema.shape.topicFamiliarity,
  ),
  knownConcepts: optionalField(editablePreferencesSchema.shape.knownConcepts),
  learningGoal: optionalField(editablePreferencesSchema.shape.learningGoal),
  experienceLevel: optionalField(
    editablePreferencesSchema.shape.experienceLevel,
  ),
  languages: optionalField(editablePreferencesSchema.shape.languages),
  stack: optionalField(editablePreferencesSchema.shape.stack),
  learningGoals: optionalField(editablePreferencesSchema.shape.learningGoals),
  currentFocus: optionalField(editablePreferencesSchema.shape.currentFocus),
  aboutMe: optionalField(editablePreferencesSchema.shape.aboutMe),
});
export const profilePreferencesSchema = editablePreferencesSchema.extend({
  profileId: profileIdSchema,
  updatedAt: z.string(),
  developerContextUpdatedAt: z.string().nullable().default(null),
});
export type Profile = z.infer<typeof profileSchema>;
export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>;
export type SavePreferencesInput = z.infer<typeof savePreferencesRequestSchema>;
