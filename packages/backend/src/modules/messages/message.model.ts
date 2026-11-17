import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, first, sqliteDatabase } from "../../shared/database/db";
import {
  harnessItems,
  harnessThreads,
  harnessTurns,
} from "../../shared/database/schema";
import { messagesLegacy } from "../../shared/database/schema.legacy";
import { AppError } from "../../shared/errors/app-error";
import type { MessageAttachment } from "./message.schema";

export type MessageRow = {
  id: string;
  challengeId: string;
  role: "user" | "assistant";
  mode: "generate" | "clarify" | "review" | "hint";
  content: string;
  attachments: MessageAttachment[];
  createdAt: Date;
  status: "streaming" | "completed" | "failed" | "cancelled" | "interrupted";
  error: string | null;
  replyTo: string | null;
};

let legacyAvailable: boolean | undefined;
async function hasLegacyMessages() {
  if (legacyAvailable === undefined)
    legacyAvailable = await sqliteDatabase().local((database) =>
      Boolean(
        database
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages_legacy'",
          )
          .get(),
      ),
    );
  return legacyAvailable;
}

/**
 * Chat and hints now live in harness threads. Older transcript rows stay
 * readable from `messages_legacy`, but this module never writes them again.
 */
export const messageModel = {
  async findRowsByChallenge(challengeId: string): Promise<MessageRow[]> {
    const threads = await db
      .select()
      .from(harnessThreads)
      .where(
        and(
          eq(harnessThreads.challengeId, challengeId),
          inArray(harnessThreads.kind, ["chat", "hint"]),
        ),
      )
      .orderBy(asc(harnessThreads.createdAt));
    const threadIds = threads.map((thread) => thread.id);
    const items = threadIds.length
      ? await db
          .select()
          .from(harnessItems)
          .where(
            and(
              inArray(harnessItems.threadId, threadIds),
              inArray(harnessItems.type, ["user_message", "assistant_message"]),
            ),
          )
          .orderBy(asc(harnessItems.ordinal))
      : [];
    const byThread = new Map(threads.map((thread) => [thread.id, thread]));
    const current = items.map((item): MessageRow => {
      const thread = byThread.get(item.threadId)!;
      const error = item.payload?.error as { message?: string } | undefined;
      return {
        id: item.id,
        challengeId,
        role: item.type === "user_message" ? "user" : "assistant",
        // Both sides belong to the hint conversation. Its request must not
        // appear as a standalone discussion message reading only "Hint".
        mode: thread.kind === "hint" ? "hint" : "clarify",
        content: item.text ?? "",
        attachments: [],
        createdAt: item.createdAt,
        status:
          item.status === "running"
            ? "streaming"
            : item.status === "cancelled"
              ? "cancelled"
              : item.status === "failed"
                ? "failed"
                : "completed",
        error: error?.message ?? null,
        replyTo: null,
      };
    });
    const legacy = (await hasLegacyMessages())
      ? await db
          .select()
          .from(messagesLegacy)
          .where(eq(messagesLegacy.challengeId, challengeId))
          .orderBy(asc(messagesLegacy.createdAt))
      : [];
    return [
      ...current,
      ...legacy
        .filter((row) => row.mode !== "review")
        .map((row): MessageRow => ({
          id: row.id,
          challengeId: row.challengeId,
          role: row.role as MessageRow["role"],
          mode: row.mode as MessageRow["mode"],
          content: row.content,
          attachments: (row.attachments as MessageAttachment[]) ?? [],
          createdAt: row.createdAt,
          // A legacy streaming row can never resume because the old writer
          // is gone. Show it as interrupted without rewriting stored data.
          status:
            row.status === "streaming"
              ? "interrupted"
              : (row.status as MessageRow["status"]),
          error: row.error,
          replyTo: row.replyTo,
        })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async findChatTranscript(challengeId: string) {
    return (await this.findRowsByChallenge(challengeId)).filter(
      (row) => row.status === "completed" && row.mode !== "hint",
    );
  },

  async retryInput(challengeId: string, id: string) {
    const row = await first(
      db.select().from(harnessItems).where(eq(harnessItems.id, id)),
    );
    const thread =
      row &&
      (await first(
        db
          .select()
          .from(harnessThreads)
          .where(
            and(
              eq(harnessThreads.id, row.threadId),
              eq(harnessThreads.challengeId, challengeId),
              eq(harnessThreads.kind, "chat"),
            ),
          ),
      ));
    if (!row || row.type !== "assistant_message" || !thread)
      throw new AppError(
        "MESSAGE_NOT_RETRYABLE",
        "Choose a failed or stopped response to retry.",
        409,
      );
    const turn = row.turnId
      ? await first(
          db.select().from(harnessTurns).where(eq(harnessTurns.id, row.turnId)),
        )
      : undefined;
    return {
      content: turn?.inputText ?? "Retry the previous request.",
      attachments: [] as MessageAttachment[],
      mode: "clarify" as const,
    };
  },

  /** Latest chat thread for a challenge, reusing one visible transcript. */
  async chatThread(profileId: string, challengeId: string) {
    return first(
      db
        .select()
        .from(harnessThreads)
        .where(
          and(
            eq(harnessThreads.profileId, profileId),
            eq(harnessThreads.challengeId, challengeId),
            eq(harnessThreads.kind, "chat"),
          ),
        )
        .orderBy(desc(harnessThreads.updatedAt))
        .limit(1),
    );
  },
};

export type MessageModel = typeof messageModel;
