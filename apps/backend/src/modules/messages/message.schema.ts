import { z } from "zod";

export const messageModeSchema = z.enum([
  "generate",
  "clarify",
  "review",
  "hint",
]);

export const messageSchema = z.object({
  id: z.string().uuid(),
  challengeId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  mode: messageModeSchema,
  content: z.string(),
  createdAt: z.string(),
});

export const createMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(40_000),
  mode: z.enum(["clarify", "review"]),
});

export type ChatMessage = z.infer<typeof messageSchema>;
export type ConversationMode = z.infer<
  typeof createMessageRequestSchema
>["mode"];
