import { and, count, desc, eq, getTableColumns, or } from "drizzle-orm";
import {
  db,
  caseInsensitiveLike,
  sqliteDatabase,
} from "../../shared/database/db";
import {
  aiLogEventsLegacy,
  aiLogsLegacy,
} from "../../shared/database/schema.legacy";
import type { LogQuery } from "./log.schema";

/**
 * Logs are retired data. This reader never creates rows and returns an empty
 * result on fresh installs, where the legacy log tables do not exist.
 */
export type LogRow = typeof aiLogsLegacy.$inferSelect;
const PAGE_SIZE = 25;

let legacyAvailable: boolean | undefined;
async function available() {
  if (legacyAvailable === undefined)
    legacyAvailable = await sqliteDatabase().local((database) =>
      Boolean(
        database
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_logs_legacy'",
          )
          .get(),
      ),
    );
  return legacyAvailable;
}

export const logModel = {
  async findOwned(id: string, profileId: string) {
    if (!(await available())) return undefined;
    const row = (
      await db
        .select()
        .from(aiLogsLegacy)
        .where(
          and(eq(aiLogsLegacy.id, id), eq(aiLogsLegacy.profileId, profileId)),
        )
    )[0];
    if (!row) return undefined;
    const events = await db
      .select({ payload: aiLogEventsLegacy.payload })
      .from(aiLogEventsLegacy)
      .where(eq(aiLogEventsLegacy.logId, id))
      .orderBy(aiLogEventsLegacy.id);
    return {
      ...row,
      streamEvents: events.length
        ? [
            ...((row.streamEvents as unknown[] | null) ?? []),
            ...events.map((e) => e.payload),
          ]
        : row.streamEvents,
    };
  },
  async list(profileId: string, query: LogQuery) {
    const legacy = await available();
    if (!legacy)
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        totalPages: 1,
        available: false,
      };
    const {
      requestBody: _request,
      responseBody: _response,
      responseText: _text,
      streamEvents: _events,
      error: _error,
      ...summaryColumns
    } = getTableColumns(aiLogsLegacy);

    const search = query.search.toLowerCase();
    const where = and(
      eq(aiLogsLegacy.profileId, profileId),
      query.status ? eq(aiLogsLegacy.status, query.status) : undefined,
      query.operation ? eq(aiLogsLegacy.operation, query.operation) : undefined,
      search
        ? or(
            ...[
              aiLogsLegacy.requestedModel,
              aiLogsLegacy.actualModel,
              aiLogsLegacy.preview,
              aiLogsLegacy.id,
            ].map((column) => caseInsensitiveLike(column, `%${search}%`)),
          )
        : undefined,
    );
    return db.transaction(async (tx) => {
      const total = (
        await tx.select({ count: count() }).from(aiLogsLegacy).where(where)
      )[0]!.count;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(query.page, totalPages);
      const items = await tx
        .select(summaryColumns)
        .from(aiLogsLegacy)
        .where(where)
        .orderBy(desc(aiLogsLegacy.startedAt), desc(aiLogsLegacy.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return {
        items,
        total,
        page,
        pageSize: PAGE_SIZE,
        totalPages,
        available: true,
      };
    });
  },
};
