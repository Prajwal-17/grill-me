import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db, first, lockRows } from "../../shared/database/db";
import { projectPreparations } from "../../shared/database/schema";
import type {
  ProjectFrozenSpecification,
  ProjectPreparationActivity,
  ProjectPreparationError,
  ProjectScaffoldReport,
} from "@repo/backend/shared/contracts";

export type ProjectPreparationRow = typeof projectPreparations.$inferSelect;

export const projectPreparationModel = {
  latest(challengeId: string) {
    return first(
      db
        .select()
        .from(projectPreparations)
        .where(eq(projectPreparations.challengeId, challengeId))
        .orderBy(desc(projectPreparations.attempt))
        .limit(1),
    );
  },

  previous(challengeId: string, attempt: number) {
    return first(
      db
        .select()
        .from(projectPreparations)
        .where(
          and(
            eq(projectPreparations.challengeId, challengeId),
            lt(projectPreparations.attempt, attempt),
          ),
        )
        .orderBy(desc(projectPreparations.attempt))
        .limit(1),
    );
  },

  active(challengeId: string) {
    return first(
      db
        .select()
        .from(projectPreparations)
        .where(
          and(
            eq(projectPreparations.challengeId, challengeId),
            inArray(projectPreparations.status, ["not_started", "running"]),
          ),
        )
        .orderBy(desc(projectPreparations.attempt))
        .limit(1),
    );
  },

  /** Current writer fence for command execution, independent of UI reads. */
  runningByToken(id: string, runToken: string) {
    return first(
      db
        .select()
        .from(projectPreparations)
        .where(
          and(
            eq(projectPreparations.id, id),
            eq(projectPreparations.runToken, runToken),
            eq(projectPreparations.status, "running"),
          ),
        )
        .limit(1),
    );
  },

  create(input: {
    id: string;
    profileId: string;
    challengeId: string;
    attempt: number;
    projectDirectory: string;
    projectPath: string;
    specification: ProjectFrozenSpecification;
    requestedModel: string | null;
    at: Date;
  }) {
    return first(
      db
        .insert(projectPreparations)
        .values({
          ...input,
          status: "not_started",
          activity: [],
          createdAt: input.at,
          updatedAt: input.at,
        })
        .returning(),
    );
  },

  failPending(
    id: string,
    error: ProjectPreparationError,
    activity: ProjectPreparationActivity[],
    at: Date,
  ) {
    return first(
      db
        .update(projectPreparations)
        .set({
          status: "failed",
          error,
          report: null,
          activity,
          runToken: null,
          completedAt: at,
          updatedAt: at,
        })
        .where(
          and(
            eq(projectPreparations.id, id),
            eq(projectPreparations.status, "not_started"),
          ),
        )
        .returning(),
    );
  },

  markRunning(
    id: string,
    runToken: string,
    activity: ProjectPreparationActivity[],
    at: Date,
  ) {
    return first(
      db
        .update(projectPreparations)
        .set({
          status: "running",
          runToken,
          activity,
          startedAt: at,
          updatedAt: at,
        })
        .where(
          and(
            eq(projectPreparations.id, id),
            eq(projectPreparations.status, "not_started"),
          ),
        )
        .returning(),
    );
  },

  updateActivity(
    id: string,
    runToken: string,
    activity: ProjectPreparationActivity[],
    at: Date,
  ) {
    return first(
      db
        .update(projectPreparations)
        .set({ activity, updatedAt: at })
        .where(
          and(
            eq(projectPreparations.id, id),
            eq(projectPreparations.runToken, runToken),
            eq(projectPreparations.status, "running"),
          ),
        )
        .returning({
          id: projectPreparations.id,
          status: projectPreparations.status,
        }),
    );
  },

  finish(input: {
    id: string;
    runToken: string;
    status: "ready" | "failed" | "cancelled" | "interrupted";
    report: ProjectScaffoldReport | null;
    error: ProjectPreparationError | null;
    activity: ProjectPreparationActivity[];
    at: Date;
  }) {
    return first(
      db
        .update(projectPreparations)
        .set({
          status: input.status,
          report: input.report,
          error: input.error,
          activity: input.activity,
          runToken: null,
          completedAt: input.at,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(projectPreparations.id, input.id),
            eq(projectPreparations.runToken, input.runToken),
            eq(projectPreparations.status, "running"),
          ),
        )
        .returning(),
    );
  },

  cancel(challengeId: string, activity: ProjectPreparationActivity, at: Date) {
    return db.transaction(async (tx) => {
      const [row] = await lockRows(
        tx
          .select()
          .from(projectPreparations)
          .where(eq(projectPreparations.challengeId, challengeId))
          .orderBy(desc(projectPreparations.attempt))
          .limit(1),
        "update",
      );
      if (!row || (row.status !== "not_started" && row.status !== "running"))
        return row ?? null;
      const [cancelled] = await tx
        .update(projectPreparations)
        .set({
          status: "cancelled",
          runToken: null,
          error: null,
          activity: [...row.activity, activity].slice(-200),
          completedAt: at,
          updatedAt: at,
        })
        .where(eq(projectPreparations.id, row.id))
        .returning();
      return cancelled ?? null;
    });
  },

  async markInterrupted(at = new Date()) {
    return db
      .update(projectPreparations)
      .set({
        status: "interrupted",
        runToken: null,
        error: {
          code: "PROJECT_PREPARATION_INTERRUPTED",
          message:
            "The app stopped before project preparation finished. Partial files are preserved; start another attempt when ready.",
          retryable: true,
        },
        completedAt: at,
        updatedAt: at,
      })
      .where(eq(projectPreparations.status, "running"))
      .returning({
        id: projectPreparations.id,
        challengeId: projectPreparations.challengeId,
      });
  },
};

export type ProjectPreparationModel = typeof projectPreparationModel;
