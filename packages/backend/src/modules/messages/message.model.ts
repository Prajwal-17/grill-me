import { asc, eq } from "drizzle-orm";
import { db, sqliteDatabase } from "../../shared/database/db";
import { changed } from "../../local/changes";
import { AppError } from "../../shared/errors/app-error";
import { messages } from "../../shared/database/schema";
import type { ConversationMode, MessageAttachment } from "./message.schema";

export type MessageRow = typeof messages.$inferSelect;

export const messageModel = {
  async beginExchange(input: {
    challengeId: string;
    content: string;
    mode: ConversationMode;
    attachments: MessageAttachment[];
    userId?: string;
  }) {
    const assistantId = crypto.randomUUID();
    const userId = input.userId ?? crypto.randomUUID();
    await sqliteDatabase().local((database) =>
      database
        .transaction(() => {
          if (
            database
              .query(
                "SELECT id FROM messages WHERE challenge_id=? AND status='streaming' LIMIT 1",
              )
              .get(input.challengeId)
          )
            throw new AppError(
              "CONVERSATION_BUSY",
              "A response is already running for this challenge. Stop it or wait for it to finish.",
              409,
              true,
            );
          const now = Date.now();
          if (!input.userId)
            database
              .query(
                "INSERT INTO messages(id,challenge_id,role,mode,content,attachments,created_at,status) VALUES(?,?,'user',?,?,?,?, 'completed')",
              )
              .run(
                userId,
                input.challengeId,
                input.mode,
                input.content,
                JSON.stringify(input.attachments),
                now,
              );
          database
            .query(
              "INSERT INTO messages(id,challenge_id,role,mode,content,attachments,created_at,status,reply_to) VALUES(?,?,'assistant',?,'','[]',?,'streaming',?)",
            )
            .run(assistantId, input.challengeId, input.mode, now + 1, userId);
        })
        .immediate(),
    );
    changed("messages");
    return { assistantId, userId };
  },
  async checkpoint(
    id: string,
    content: string,
    status = "streaming",
    error: string | null = null,
  ) {
    await sqliteDatabase().local((database) => {
      database
        .query(
          "UPDATE messages SET content=?,status=?,error=? WHERE id=? AND status='streaming'",
        )
        .run(content, status, error, id);
    });
    changed("messages");
  },
  async retryInput(challengeId: string, id: string) {
    return sqliteDatabase().local((database) => {
      const row = database
        .query(
          "SELECT u.id,u.content,u.mode,u.attachments FROM messages a JOIN messages u ON u.id=a.reply_to WHERE a.id=? AND a.challenge_id=? AND a.role='assistant' AND a.status IN ('failed','cancelled','interrupted')",
        )
        .get(id, challengeId) as {
        id: string;
        content: string;
        mode: ConversationMode;
        attachments: string;
      } | null;
      if (!row)
        throw new AppError(
          "MESSAGE_NOT_RETRYABLE",
          "Choose a failed or stopped response to retry.",
          409,
        );
      return {
        ...row,
        attachments: JSON.parse(row.attachments) as MessageAttachment[],
      };
    });
  },
  async recover() {
    await sqliteDatabase().local((database) => {
      database
        .query(
          "UPDATE messages SET status='interrupted',error='The app stopped before this response finished. Retry when ready.' WHERE status='streaming'",
        )
        .run();
    });
  },
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
