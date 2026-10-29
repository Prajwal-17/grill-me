import { asc, eq } from "drizzle-orm";
import { db } from "../../shared/database/db";
import { messages } from "../../shared/database/schema";
import type { ConversationMode, MessageAttachment } from "./message.schema";

export type MessageRow = typeof messages.$inferSelect;

export const messageModel = {
  findRowsByChallenge(challengeId: string) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.challengeId, challengeId))
      .orderBy(asc(messages.createdAt));
  },

  saveExchange(input: {
    challengeId: string;
    content: string;
    reply: string;
    mode: ConversationMode;
    attachments: MessageAttachment[];
  }) {
    const now = new Date();

    return db.transaction(async (tx) => {
      await tx.insert(messages).values({
        id: crypto.randomUUID(),
        challengeId: input.challengeId,
        role: "user",
        mode: input.mode,
        content: input.content,
        attachments: input.attachments,
        createdAt: now,
      });

      return (
        await tx
          .insert(messages)
          .values({
            id: crypto.randomUUID(),
            challengeId: input.challengeId,
            role: "assistant",
            mode: input.mode,
            content: input.reply,
            attachments: [],
            createdAt: new Date(now.getTime() + 1),
          })
          .returning()
      )[0]!;
    });
  },
};

export type MessageModel = typeof messageModel;
