import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  harnessAttachments,
  harnessItems,
  harnessThreads,
  harnessTurnAttempts,
  harnessTurns,
} from "../../shared/database/schema";
import { db, first } from "../../shared/database/db";

export type HarnessThreadRow = typeof harnessThreads.$inferSelect;
export type HarnessTurnRow = typeof harnessTurns.$inferSelect;
export type HarnessTurnAttemptRow = typeof harnessTurnAttempts.$inferSelect;
export type HarnessItemRow = typeof harnessItems.$inferSelect;
export type HarnessAttachmentRow = typeof harnessAttachments.$inferSelect;

const now = () => new Date();

export const harnessModel = {
  insertThread(input: {
    id: string;
    profileId: string;
    kind: string;
    title: string;
    challengeId: string | null;
    parentThreadId: string | null;
    transport: HarnessThreadRow["transport"];
    connectionId: string | null;
    model: string;
    reasoningEffort: string | null;
    runtimeMode: HarnessThreadRow["runtimeMode"];
    at?: Date;
  }) {
    const at = input.at ?? now();
    return first(
      db
        .insert(harnessThreads)
        .values({
          ...input,
          status: "queued",
          createdAt: at,
          updatedAt: at,
        })
        .returning(),
    );
  },

  findThread(id: string) {
    return first(
      db.select().from(harnessThreads).where(eq(harnessThreads.id, id)),
    );
  },

  findThreadOwned(id: string, profileId: string) {
    return first(
      db
        .select()
        .from(harnessThreads)
        .where(
          and(
            eq(harnessThreads.id, id),
            eq(harnessThreads.profileId, profileId),
          ),
        ),
    );
  },

  updateThread(
    id: string,
    patch: Partial<
      Pick<
        HarnessThreadRow,
        | "title"
        | "status"
        | "model"
        | "reasoningEffort"
        | "runtimeMode"
        | "nativeThreadId"
        | "errorCode"
        | "errorMessage"
        | "completedAt"
      >
    >,
  ) {
    return first(
      db
        .update(harnessThreads)
        .set({ ...patch, updatedAt: now() })
        .where(eq(harnessThreads.id, id))
        .returning(),
    );
  },

  listThreads(
    profileId: string,
    filter: { kind?: string; challengeId?: string; limit: number },
  ) {
    return db
      .select()
      .from(harnessThreads)
      .where(
        and(
          eq(harnessThreads.profileId, profileId),
          filter.kind ? eq(harnessThreads.kind, filter.kind) : undefined,
          filter.challengeId
            ? eq(harnessThreads.challengeId, filter.challengeId)
            : undefined,
        ),
      )
      .orderBy(desc(harnessThreads.updatedAt))
      .limit(filter.limit);
  },

  countsForThreads(threadIds: string[]) {
    if (!threadIds.length)
      return Promise.resolve(
        new Map<string, { turns: number; items: number }>(),
      );
    return db.transaction(async (tx) => {
      const turns = await tx
        .select({
          threadId: harnessTurns.threadId,
          count: sql<number>`count(*)`,
        })
        .from(harnessTurns)
        .where(inArray(harnessTurns.threadId, threadIds))
        .groupBy(harnessTurns.threadId);
      const items = await tx
        .select({
          threadId: harnessItems.threadId,
          count: sql<number>`count(*)`,
        })
        .from(harnessItems)
        .where(inArray(harnessItems.threadId, threadIds))
        .groupBy(harnessItems.threadId);
      const result = new Map<string, { turns: number; items: number }>();
      for (const id of threadIds) result.set(id, { turns: 0, items: 0 });
      for (const row of turns)
        result.set(row.threadId, {
          ...(result.get(row.threadId) ?? { turns: 0, items: 0 }),
          turns: Number(row.count),
        });
      for (const row of items)
        result.set(row.threadId, {
          ...(result.get(row.threadId) ?? { turns: 0, items: 0 }),
          items: Number(row.count),
        });
      return result;
    });
  },

  appendTurn(input: {
    id: string;
    threadId: string;
    inputText: string;
    transport: HarnessTurnRow["transport"];
    connectionId: string | null;
    model: string;
    reasoningEffort: string | null;
    runtimeMode: HarnessTurnRow["runtimeMode"];
    at?: Date;
  }) {
    const at = input.at ?? now();
    return db.transaction(async (tx) => {
      const [last] = await tx
        .select({
          value: sql<number>`coalesce(max(${harnessTurns.ordinal}), 0)`,
        })
        .from(harnessTurns)
        .where(eq(harnessTurns.threadId, input.threadId));
      const [turn] = await tx
        .insert(harnessTurns)
        .values({
          id: input.id,
          threadId: input.threadId,
          ordinal: Number(last?.value ?? 0) + 1,
          status: "queued",
          inputText: input.inputText,
          transport: input.transport,
          connectionId: input.connectionId,
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          runtimeMode: input.runtimeMode,
          requestedAt: at,
        })
        .returning();
      return turn!;
    });
  },

  updateTurn(
    id: string,
    patch: Partial<
      Pick<
        HarnessTurnRow,
        | "status"
        | "runtimeMode"
        | "nativeTurnId"
        | "inputTokens"
        | "outputTokens"
        | "totalTokens"
        | "errorCode"
        | "errorMessage"
        | "startedAt"
        | "completedAt"
      >
    >,
  ) {
    return first(
      db
        .update(harnessTurns)
        .set(patch)
        .where(eq(harnessTurns.id, id))
        .returning(),
    );
  },

  findTurn(id: string) {
    return first(db.select().from(harnessTurns).where(eq(harnessTurns.id, id)));
  },

  findTurns(threadId: string) {
    return db
      .select()
      .from(harnessTurns)
      .where(eq(harnessTurns.threadId, threadId))
      .orderBy(asc(harnessTurns.ordinal));
  },

  findLatestTurn(threadId: string) {
    return first(
      db
        .select()
        .from(harnessTurns)
        .where(eq(harnessTurns.threadId, threadId))
        .orderBy(desc(harnessTurns.ordinal))
        .limit(1),
    );
  },

  appendAttempt(input: {
    id: string;
    turnId: string;
    nativeThreadId?: string | null;
    at?: Date;
  }) {
    const at = input.at ?? now();
    return db.transaction(async (tx) => {
      const [last] = await tx
        .select({
          value: sql<number>`coalesce(max(${harnessTurnAttempts.ordinal}), 0)`,
        })
        .from(harnessTurnAttempts)
        .where(eq(harnessTurnAttempts.turnId, input.turnId));
      const [attempt] = await tx
        .insert(harnessTurnAttempts)
        .values({
          id: input.id,
          turnId: input.turnId,
          ordinal: Number(last?.value ?? 0) + 1,
          status: "running",
          nativeThreadId: input.nativeThreadId ?? null,
          startedAt: at,
        })
        .returning();
      return attempt!;
    });
  },

  updateAttempt(
    id: string,
    patch: Partial<
      Pick<
        HarnessTurnAttemptRow,
        | "status"
        | "nativeThreadId"
        | "nativeTurnId"
        | "errorCode"
        | "errorMessage"
        | "completedAt"
      >
    >,
  ) {
    return first(
      db
        .update(harnessTurnAttempts)
        .set(patch)
        .where(eq(harnessTurnAttempts.id, id))
        .returning(),
    );
  },

  findAttempts(turnId: string) {
    return db
      .select()
      .from(harnessTurnAttempts)
      .where(eq(harnessTurnAttempts.turnId, turnId))
      .orderBy(asc(harnessTurnAttempts.ordinal));
  },

  appendItem(input: {
    id: string;
    threadId: string;
    turnId: string | null;
    attemptId: string | null;
    parentItemId: string | null;
    type: HarnessItemRow["type"];
    status: HarnessItemRow["status"];
    title: string | null;
    text: string | null;
    payload: Record<string, unknown>;
    startedAt: Date | null;
    at?: Date;
  }) {
    const at = input.at ?? now();
    return db.transaction(async (tx) => {
      const [last] = await tx
        .select({
          value: sql<number>`coalesce(max(${harnessItems.ordinal}), 0)`,
        })
        .from(harnessItems)
        .where(eq(harnessItems.threadId, input.threadId));
      const [item] = await tx
        .insert(harnessItems)
        .values({
          id: input.id,
          threadId: input.threadId,
          turnId: input.turnId,
          attemptId: input.attemptId,
          parentItemId: input.parentItemId,
          ordinal: Number(last?.value ?? 0) + 1,
          type: input.type,
          status: input.status,
          title: input.title,
          text: input.text,
          payload: input.payload,
          startedAt: input.startedAt,
          completedAt:
            input.status === "pending" || input.status === "running"
              ? null
              : at,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      return item!;
    });
  },

  updateItem(
    id: string,
    patch: Partial<
      Pick<
        HarnessItemRow,
        "status" | "title" | "text" | "payload" | "completedAt"
      >
    >,
  ) {
    return first(
      db
        .update(harnessItems)
        .set({ ...patch, updatedAt: now() })
        .where(eq(harnessItems.id, id))
        .returning(),
    );
  },

  findItem(id: string) {
    return first(db.select().from(harnessItems).where(eq(harnessItems.id, id)));
  },

  findItems(threadId: string) {
    return db
      .select()
      .from(harnessItems)
      .where(eq(harnessItems.threadId, threadId))
      .orderBy(asc(harnessItems.ordinal));
  },

  findAttachments(threadId: string) {
    return db
      .select()
      .from(harnessAttachments)
      .where(eq(harnessAttachments.threadId, threadId))
      .orderBy(asc(harnessAttachments.createdAt));
  },

  async interruptRunning() {
    const at = now();
    await db
      .update(harnessThreads)
      .set({
        status: "interrupted",
        errorCode: "HARNESS_INTERRUPTED",
        errorMessage:
          "The app stopped before this run finished. Partial output is preserved; retry starts a new turn.",
        completedAt: at,
        updatedAt: at,
      })
      .where(inArray(harnessThreads.status, ["queued", "running", "waiting"]));
    await db
      .update(harnessTurns)
      .set({
        status: "interrupted",
        errorCode: "HARNESS_INTERRUPTED",
        errorMessage: "The app stopped before this turn finished.",
        completedAt: at,
      })
      .where(inArray(harnessTurns.status, ["queued", "running", "waiting"]));
    await db
      .update(harnessTurnAttempts)
      .set({
        status: "interrupted",
        errorCode: "HARNESS_INTERRUPTED",
        errorMessage: "The app stopped before this attempt finished.",
        completedAt: at,
      })
      .where(
        inArray(harnessTurnAttempts.status, ["queued", "running", "waiting"]),
      );
    await db
      .update(harnessItems)
      .set({ status: "failed", completedAt: at, updatedAt: at })
      .where(inArray(harnessItems.status, ["pending", "running"]));
  },
};
