import { z } from "zod";
import {
  EXPERIENCE,
  LANGUAGES,
  STACK,
  GOALS,
  FOCUS,
  optionIds,
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
    .array(z.enum(optionIds(LANGUAGES)))
    .max(LANGUAGES.length)
    .default([])
    .transform(unique),
  stack: z
    .array(z.enum(optionIds(STACK)))
    .max(STACK.length)
    .default([])
    .transform(unique),
  learningGoals: z
    .array(z.enum(optionIds(GOALS)))
    .max(GOALS.length)
    .default([])
    .transform(unique),
  currentFocus: z.enum(optionIds(FOCUS)).nullable().default(null),
});
export const savePreferencesRequestSchema = guidedPreferencesSchema.extend({
  aboutMe: z
    .string()
    .trim()
    .max(4_000)
    .nullable()
    .default(null)
    .transform((value) => value || null),
});
export const profilePreferencesSchema = savePreferencesRequestSchema.extend({
  profileId: profileIdSchema,
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;
export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>;
export type SavePreferencesInput = z.infer<typeof savePreferencesRequestSchema>;
