import { asc, eq } from "drizzle-orm";
import { db } from "../../shared/database/db";
import { messages } from "../../shared/database/schema";
import type { ConversationMode } from "./message.schema";

export type MessageRow = typeof messages.$inferSelect;

export const messageModel = {
  findRowsByChallenge(challengeId: string) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.challengeId, challengeId))
      .orderBy(asc(messages.createdAt))
      .all();
  },

  saveExchange(input: {
    challengeId: string;
    content: string;
    reply: string;
    mode: ConversationMode;
  }) {
    const now = new Date();

    return db.transaction((tx) => {
      tx.insert(messages)
        .values({
          id: crypto.randomUUID(),
          challengeId: input.challengeId,
          role: "user",
          mode: input.mode,
          content: input.content,
          createdAt: now,
        })
        .run();

      return tx
        .insert(messages)
        .values({
          id: crypto.randomUUID(),
          challengeId: input.challengeId,
          role: "assistant",
          mode: input.mode,
          content: input.reply,
          createdAt: new Date(now.getTime() + 1),
        })
        .returning()
        .get();
    });
  },
};

export type MessageModel = typeof messageModel;
