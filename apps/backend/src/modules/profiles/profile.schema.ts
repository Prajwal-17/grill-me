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

export type Profile = z.infer<typeof profileSchema>;
