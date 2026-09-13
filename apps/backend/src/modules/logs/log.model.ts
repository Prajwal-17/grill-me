import { and, count, desc, eq, getTableColumns, or, sql } from "drizzle-orm";
import { db } from "../../shared/database/db";
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
  start(value: LogInsert) {
    db.insert(aiLogs).values(value).run();
  },
  finish(id: string, value: Partial<LogInsert>) {
    db.update(aiLogs).set(value).where(eq(aiLogs.id, id)).run();
  },
  appendEvent(logId: string, payload: unknown) {
    db.insert(aiLogEvents).values({ logId, payload }).run();
  },
  findOwned(id: string, profileId: string) {
    const row = db
      .select()
      .from(aiLogs)
      .where(and(eq(aiLogs.id, id), eq(aiLogs.profileId, profileId)))
      .get();
    if (!row) return undefined;
    const events = db
      .select({ payload: aiLogEvents.payload })
      .from(aiLogEvents)
      .where(eq(aiLogEvents.logId, id))
      .orderBy(aiLogEvents.id)
      .all();
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
            ].map((column) => sql`instr(lower(${column}), ${search}) > 0`),
          )
        : undefined,
    );
    return db.transaction((tx) => {
      const total = tx
        .select({ count: count() })
        .from(aiLogs)
        .where(where)
        .get()!.count;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(query.page, totalPages);
      const items = tx
        .select(summaryColumns)
        .from(aiLogs)
        .where(where)
        .orderBy(desc(aiLogs.startedAt), desc(aiLogs.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE)
        .all();
      return { items, total, page, pageSize: PAGE_SIZE, totalPages };
    });
  },
  markInterrupted() {
    db.update(aiLogs)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        error: {
          code: "PROCESS_INTERRUPTED",
          message:
            "The backend restarted before this request finished. A complete response was not recorded.",
        },
      })
      .where(eq(aiLogs.status, "running"))
      .run();
  },
};
