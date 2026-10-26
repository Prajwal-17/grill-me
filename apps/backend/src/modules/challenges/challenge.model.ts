import {
  PROMPT_VERSION,
  CALIBRATION_VERSION,
  CONTRACT_VERSION,
} from "../ai/prompts/core";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  isNotNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db, first } from "../../shared/database/db";
import { challenges, messages } from "../../shared/database/schema";
import type { ChallengeContent } from "./challenge.schema";

export type ChallengeRow = typeof challenges.$inferSelect;

export const challengeModel = {
  findRecent(profileId: string, limit = 10) {
    return db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.profileId, profileId),
          isNull(challenges.archivedAt),
          ne(challenges.status, "saved"),
        ),
      )
      .orderBy(desc(challenges.createdAt))
      .limit(limit);
  },

  findActive(profileId: string) {
    return db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.profileId, profileId),
          inArray(challenges.status, ["active", "paused"]),
          isNull(challenges.archivedAt),
        ),
      )
      .orderBy(desc(challenges.createdAt));
  },

  findSaved(profileId: string) {
    return db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.profileId, profileId),
          eq(challenges.status, "saved"),
        ),
      )
      .orderBy(desc(challenges.createdAt));
  },

  findArchived(profileId: string) {
    return db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.profileId, profileId),
          or(isNotNull(challenges.archivedAt), eq(challenges.status, "saved")),
        ),
      )
      .orderBy(desc(challenges.archivedAt), desc(challenges.createdAt));
  },

  findHistory(profileId: string) {
    return db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.profileId, profileId),
          inArray(challenges.status, ["completed", "stopped"]),
          isNull(challenges.archivedAt),
        ),
      )
      .orderBy(desc(challenges.completedAt));
  },

  findOwned(id: string, profileId: string) {
    return first(
      db
        .select()
        .from(challenges)
        .where(and(eq(challenges.id, id), eq(challenges.profileId, profileId))),
    );
  },

  create(
    profileId: string,
    content: ChallengeContent,
    prompt: string,
    contextSnapshot: Record<string, unknown> | null = null,
  ) {
    const id = crypto.randomUUID();
    const now = new Date();

    return db.transaction(async (tx) => {
      const nextNumber = (
        await tx
          .select({
            value: sql<number>`coalesce(max(${challenges.number}), 0) + 1`,
          })
          .from(challenges)
          .where(eq(challenges.profileId, profileId))
      )[0]!.value;
      const challenge = (
        await tx
          .insert(challenges)
          .values({
            id,
            profileId,
            number: nextNumber,
            title: content.title,
            scope: content.scope,
            difficulty: content.difficulty,
            contextualDifficulty: content.contextualDifficulty,
            estimatedDifficultyScore: null,
            difficultyReason: content.difficultyReason,
            topic: content.topic,
            implementationBoundary: content.implementationBoundary,
            contextSnapshot,
            promptVersion: PROMPT_VERSION,
            calibrationVersion: CALIBRATION_VERSION,
            contractVersion: CONTRACT_VERSION,

            durationMinMinutes: content.durationEstimate.minMinutes,
            durationMaxMinutes: content.durationEstimate.maxMinutes,
            implementationMilestones: content.implementationMilestones,
            problemStatement: content.problemStatement,
            expectedOutcome: content.expectedOutcome,
            constraints: content.constraints,
            starterCode: content.starterCode,
            completionCriteria: content.completionCriteria,
            createdAt: now,
          })
          .returning()
      )[0]!;

      await tx.insert(messages).values([
        {
          id: crypto.randomUUID(),
          challengeId: id,
          role: "user",
          mode: "generate",
          content: prompt,
          createdAt: now,
        },
        {
          id: crypto.randomUUID(),
          challengeId: id,
          role: "assistant",
          mode: "generate",
          content:
            "Your build is ready: **" +
            content.title +
            "**. Ask me anything about the requirements when you get stuck.",
          createdAt: new Date(now.getTime() + 1),
        },
      ]);

      return challenge;
    });
  },

  setStatus(id: string, status: "active" | "paused" | "saved" | "stopped") {
    return first(
      db
        .update(challenges)
        .set({ status, completedAt: null, completionSource: null })
        .where(eq(challenges.id, id))
        .returning(),
    );
  },
  setArchived(id: string, archived: boolean) {
    return first(
      db
        .update(challenges)
        .set(
          archived
            ? { archivedAt: sql`coalesce(${challenges.archivedAt}, now())` }
            : {
                archivedAt: null,
                // Older clients used saved as a lifecycle state. Restore those to active.
                status: sql`case when ${challenges.status} = 'saved' then 'active' else ${challenges.status} end`,
              },
        )
        .where(eq(challenges.id, id))
        .returning(),
    );
  },
  complete(id: string) {
    return first(
      db
        .update(challenges)
        .set({
          status: "completed",
          completionSource: "user",
          completedAt: new Date(),
        })
        .where(eq(challenges.id, id))
        .returning(),
    );
  },

  saveHint(id: string, hint: string, helpKind: "hint" | "approach" = "hint") {
    const now = new Date();

    return db.transaction(async (tx) => {
      const challenge = (
        await tx
          .update(challenges)
          .set({ hint })
          .where(eq(challenges.id, id))
          .returning()
      )[0]!;

      await tx.insert(messages).values({
        id: crypto.randomUUID(),
        challengeId: id,
        role: "assistant",
        mode: "hint",
        content:
          helpKind === "approach" ? "High-level approach\n\n" + hint : hint,
        createdAt: now,
      });

      return challenge;
    });
  },
};

export type ChallengeModel = typeof challengeModel;
