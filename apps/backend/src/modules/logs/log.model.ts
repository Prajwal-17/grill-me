import { and, count, desc, eq, getTableColumns, or } from "drizzle-orm";
import { db, caseInsensitiveLike } from "../../shared/database/db";
import { aiLogs, aiLogEvents } from "../../shared/database/schema";
import type { LogQuery } from "./log.schema";

export type LogInsert = typeof aiLogs.$inferInsert;
export type LogRow = typeof aiLogs.$inferSelect;
const {
  requestBody: _request,
  responseBody: _response,
  responseText: _text,
  streamEvents: _events,
  error: _error,
  ...summaryColumns
} = getTableColumns(aiLogs);
const PAGE_SIZE = 25;

export const logModel = {
  async start(value: LogInsert) {
    await db.insert(aiLogs).values(value);
  },
  async finish(id: string, value: Partial<LogInsert>) {
    await db.update(aiLogs).set(value).where(eq(aiLogs.id, id));
  },
  async appendEvent(logId: string, payload: unknown) {
    await db.insert(aiLogEvents).values({ logId, payload });
  },
  async findOwned(id: string, profileId: string) {
    const row = (
      await db
        .select()
        .from(aiLogs)
        .where(and(eq(aiLogs.id, id), eq(aiLogs.profileId, profileId)))
    )[0];
    if (!row) return undefined;
    const events = await db
      .select({ payload: aiLogEvents.payload })
      .from(aiLogEvents)
      .where(eq(aiLogEvents.logId, id))
      .orderBy(aiLogEvents.id);
    return {
      ...row,
      streamEvents: events.length
        ? [...(row.streamEvents ?? []), ...events.map((e) => e.payload)]
        : row.streamEvents,
    };
  },
  list(profileId: string, query: LogQuery) {
    const search = query.search.toLowerCase();
    const where = and(
      eq(aiLogs.profileId, profileId),
      query.status ? eq(aiLogs.status, query.status) : undefined,
      query.operation ? eq(aiLogs.operation, query.operation) : undefined,
      search
        ? or(
            ...[
              aiLogs.requestedModel,
              aiLogs.actualModel,
              aiLogs.preview,
              aiLogs.id,
            ].map((column) => caseInsensitiveLike(column, `%${search}%`)),
          )
        : undefined,
    );
    return db.transaction(async (tx) => {
      const total = (
        await tx.select({ count: count() }).from(aiLogs).where(where)
      )[0]!.count;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(query.page, totalPages);
      const items = await tx
        .select(summaryColumns)
        .from(aiLogs)
        .where(where)
        .orderBy(desc(aiLogs.startedAt), desc(aiLogs.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return { items, total, page, pageSize: PAGE_SIZE, totalPages };
    });
  },
  async markInterrupted() {
    await db
      .update(aiLogs)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        error: {
          code: "PROCESS_INTERRUPTED",
          message:
            "The backend restarted before this request finished. A complete response was not recorded.",
        },
      })
      .where(eq(aiLogs.status, "running"));
  },
};
