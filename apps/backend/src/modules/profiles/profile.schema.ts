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
export const difficultySchema = z.enum(["easy", "balanced", "challenging"]);
function unique<T>(values: T[]) {
  return [...new Set(values)];
}
export const guidedPreferencesSchema = z.object({
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
  preferredDuration: z
    .union([z.literal(30), z.literal(60), z.literal(90)])
    .default(60),
  difficulty: difficultySchema.default("balanced"),
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
