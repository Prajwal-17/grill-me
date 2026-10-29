import { z } from "zod";

export const logStatusSchema = z.enum([
  "running",
  "success",
  "error",
  "cancelled",
]);
export const logOperationSchema = z.enum([
  "resume_import",
  "preparation",
  "prompt_enhancement",
  "generation",
  "clarify",
  "review",
  "hint",
  "quiz_generation",
  "quiz_title_generation",
]);
export const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  status: logStatusSchema.optional(),
  operation: logOperationSchema.optional(),
  search: z.string().trim().max(200).default(""),
});
export const logIdSchema = z.string().uuid();
export type LogQuery = z.infer<typeof logQuerySchema>;
export type LogOperation = z.infer<typeof logOperationSchema>;
