import { z } from "zod";

export const profileIdSchema = z.string().uuid();

export const startProfileRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

export const profileSchema = z.object({
  id: profileIdSchema,
  email: z.email(),
  createdAt: z.string(),
});

const optionalPreferenceText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .default(null)
    .transform((value) => value || null);

export const difficultySchema = z.enum(["easy", "balanced", "challenging"]);

export const savePreferencesRequestSchema = z.object({
  experienceLevel: optionalPreferenceText(120),
  languagesStack: optionalPreferenceText(500),
  learningGoals: optionalPreferenceText(1_000),
  preferredDuration: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  difficulty: difficultySchema,
  aboutMe: optionalPreferenceText(4_000),
});

export const profilePreferencesSchema = savePreferencesRequestSchema.extend({
  profileId: profileIdSchema,
  updatedAt: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;
export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>;
export type SavePreferencesInput = z.infer<typeof savePreferencesRequestSchema>;
