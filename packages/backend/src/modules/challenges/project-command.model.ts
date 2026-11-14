import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, first } from "../../shared/database/db";
import {
  projectCommandAuthorizations,
  projectCommandRequests,
} from "../../shared/database/schema";
import type {
  ProjectCommand,
  ProjectCommandAuthorization,
  ProjectCommandResult,
} from "@repo/backend/shared/contracts";

export type ProjectCommandRow = typeof projectCommandRequests.$inferSelect;
export type ProjectCommandAuthorizationRow =
  typeof projectCommandAuthorizations.$inferSelect;
export type ProjectCommandPurpose = ProjectCommandRow["purpose"];
export type ProjectCommandStatus = ProjectCommandRow["status"];

const activeStatuses = ["pending", "approved", "running"] as const;
export const maxProjectCommandRecords = 50;
export const maxActiveProjectCommands = 4;

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export function projectCommandFromRow(row: ProjectCommandRow): ProjectCommand {
  return {
    id: row.id,
    purpose: row.purpose,
    checkId: row.checkId ?? null,
    status: row.status,
    command: row.command,
    cwd: row.cwd,
    install: row.install,
    network: row.network,
    timeoutMs: row.timeoutMs,
    authorization: row.authorization ?? null,
    result: row.result ?? null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: iso(row.decidedAt),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
  };
}

export function projectCommandAuthorizationFromRow(
  row: ProjectCommandAuthorizationRow,
): ProjectCommandAuthorization {
  return {
    attempt: row.attempt,
    install: row.install,
    network: row.network,
    approvedAt: row.updatedAt.toISOString(),
  };
}

export const projectCommandModel = {
  byId(id: string) {
    return first(
      db
        .select()
        .from(projectCommandRequests)
        .where(eq(projectCommandRequests.id, id))
        .limit(1),
    );
  },

  /**
   * Newest bounded command history for reconnecting state reads. The list is
   * returned oldest first so the UI can render execution order.
   */
  async list(preparationId: string, limit = maxProjectCommandRecords) {
    const rows = await db
      .select()
      .from(projectCommandRequests)
      .where(eq(projectCommandRequests.preparationId, preparationId))
      .orderBy(
        desc(projectCommandRequests.createdAt),
        desc(projectCommandRequests.id),
      )
      .limit(Math.min(Math.max(limit, 1), maxProjectCommandRecords));
    return rows.reverse();
  },

  authorization(preparationId: string) {
    return first(
      db
        .select()
        .from(projectCommandAuthorizations)
        .where(eq(projectCommandAuthorizations.preparationId, preparationId))
        .limit(1),
    );
  },

  /** Every terminal execution record, used to validate completion results. */
  executed(preparationId: string) {
    return db
      .select()
      .from(projectCommandRequests)
      .where(
        and(
          eq(projectCommandRequests.preparationId, preparationId),
          inArray(projectCommandRequests.status, [
            "succeeded",
            "failed",
            "timed_out",
            "cancelled",
          ]),
        ),
      )
      .orderBy(
        asc(projectCommandRequests.createdAt),
        asc(projectCommandRequests.id),
      );
  },

  countActive(preparationId: string) {
    return first(
      db
        .select({ count: sql<number>`count(*)` })
        .from(projectCommandRequests)
        .where(
          and(
            eq(projectCommandRequests.preparationId, preparationId),
            inArray(projectCommandRequests.status, [...activeStatuses]),
          ),
        ),
    );
  },

  create(input: {
    id: string;
    profileId: string;
    challengeId: string;
    preparationId: string;
    attempt: number;
    specificationHash: string;
    runToken: string;
    purpose: ProjectCommandPurpose;
    checkId: string | null;
    command: string;
    cwd: string;
    install: boolean;
    network: boolean;
    timeoutMs: number;
    status: "pending" | "approved";
    authorization: "attempt" | null;
    at: Date;
  }) {
    const { at, ...values } = input;
    return first(
      db
        .insert(projectCommandRequests)
        .values({
          ...values,
          decidedAt: input.status === "approved" ? at : null,
          createdAt: at,
          updatedAt: at,
        })
        .returning(),
    );
  },

  /** Approve exactly one still-pending command for the current run. */
  decide(input: {
    id: string;
    preparationId: string;
    runToken: string;
    status: "approved" | "rejected";
    authorization: "individual" | "attempt" | null;
    at: Date;
  }) {
    return first(
      db
        .update(projectCommandRequests)
        .set({
          status: input.status,
          authorization:
            input.status === "approved" ? input.authorization : null,
          decidedAt: input.at,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(projectCommandRequests.id, input.id),
            eq(projectCommandRequests.preparationId, input.preparationId),
            eq(projectCommandRequests.runToken, input.runToken),
            eq(projectCommandRequests.status, "pending"),
          ),
        )
        .returning(),
    );
  },

  /**
   * Apply an attempt-wide authorization to all pending commands whose declared
   * install/network scope is covered. Commands outside the scope stay pending.
   */
  approvePendingForAttempt(input: {
    preparationId: string;
    runToken: string;
    install: boolean;
    network: boolean;
    at: Date;
  }) {
    const conditions = [
      eq(projectCommandRequests.preparationId, input.preparationId),
      eq(projectCommandRequests.runToken, input.runToken),
      eq(projectCommandRequests.status, "pending"),
    ];
    if (!input.install)
      conditions.push(eq(projectCommandRequests.install, false));
    if (!input.network)
      conditions.push(eq(projectCommandRequests.network, false));
    return db
      .update(projectCommandRequests)
      .set({
        status: "approved",
        authorization: "attempt",
        decidedAt: input.at,
        updatedAt: input.at,
      })
      .where(and(...conditions))
      .returning();
  },

  /** Atomically claim one approved command. Only one caller can win. */
  claim(input: {
    id: string;
    preparationId: string;
    runToken: string;
    at: Date;
  }) {
    return first(
      db
        .update(projectCommandRequests)
        .set({
          status: "running",
          startedAt: input.at,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(projectCommandRequests.id, input.id),
            eq(projectCommandRequests.preparationId, input.preparationId),
            eq(projectCommandRequests.runToken, input.runToken),
            eq(projectCommandRequests.status, "approved"),
          ),
        )
        .returning(),
    );
  },

  finish(input: {
    id: string;
    status: Exclude<
      ProjectCommandStatus,
      "pending" | "approved" | "running" | "interrupted"
    >;
    result: ProjectCommandResult | null;
    at: Date;
  }) {
    return first(
      db
        .update(projectCommandRequests)
        .set({
          status: input.status,
          result: input.result,
          completedAt: input.at,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(projectCommandRequests.id, input.id),
            eq(projectCommandRequests.status, "running"),
          ),
        )
        .returning(),
    );
  },

  interruptOne(id: string, status: "cancelled" | "interrupted", at: Date) {
    return first(
      db
        .update(projectCommandRequests)
        .set({ status, completedAt: at, updatedAt: at })
        .where(
          and(
            eq(projectCommandRequests.id, id),
            inArray(projectCommandRequests.status, [...activeStatuses]),
          ),
        )
        .returning(),
    );
  },

  /** Mark active commands terminal when their run is cancelled or stopped. */
  interruptPreparation(
    preparationId: string,
    status: "cancelled" | "interrupted",
    at: Date,
  ) {
    return db
      .update(projectCommandRequests)
      .set({
        status,
        completedAt: at,
        updatedAt: at,
      })
      .where(
        and(
          eq(projectCommandRequests.preparationId, preparationId),
          inArray(projectCommandRequests.status, [...activeStatuses]),
        ),
      )
      .returning();
  },

  /** Startup recovery: no persisted command is ever auto-replayed. */
  markActiveInterrupted(at: Date) {
    return db
      .update(projectCommandRequests)
      .set({
        status: "interrupted",
        completedAt: at,
        updatedAt: at,
      })
      .where(inArray(projectCommandRequests.status, [...activeStatuses]))
      .returning();
  },

  upsertAuthorization(input: {
    id: string;
    profileId: string;
    challengeId: string;
    preparationId: string;
    attempt: number;
    specificationHash: string;
    runToken: string;
    install: boolean;
    network: boolean;
    at: Date;
  }) {
    return first(
      db
        .insert(projectCommandAuthorizations)
        .values({
          ...input,
          createdAt: input.at,
          updatedAt: input.at,
        })
        .onConflictDoUpdate({
          target: projectCommandAuthorizations.preparationId,
          set: {
            specificationHash: input.specificationHash,
            runToken: input.runToken,
            install: input.install,
            network: input.network,
            updatedAt: input.at,
          },
        })
        .returning(),
    );
  },
};

export type ProjectCommandModel = typeof projectCommandModel;
