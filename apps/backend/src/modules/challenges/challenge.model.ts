import { PROMPT_VERSION, CALIBRATION_VERSION } from "../ai/prompts/core";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../shared/database/db";
import { challenges, messages } from "../../shared/database/schema";
import type { ChallengeContent } from "./challenge.schema";

export type ChallengeRow = typeof challenges.$inferSelect;

export const challengeModel = {
  findRecent(profileId: string, limit = 10) {
    return db
      .select()
      .from(challenges)
      .where(eq(challenges.profileId, profileId))
      .orderBy(desc(challenges.createdAt))
      .limit(limit)
      .all();
  },

  findActive(profileId: string) {
    return db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.profileId, profileId),
          inArray(challenges.status, ["active", "paused"]),
        ),
      )
      .orderBy(desc(challenges.createdAt))
      .all();
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
      .orderBy(desc(challenges.createdAt))
      .all();
  },

  findHistory(profileId: string) {
    return db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.profileId, profileId),
          inArray(challenges.status, ["completed", "stopped"]),
        ),
      )
      .orderBy(desc(challenges.completedAt))
      .all();
  },

  findOwned(id: string, profileId: string) {
    return db
      .select()
      .from(challenges)
      .where(and(eq(challenges.id, id), eq(challenges.profileId, profileId)))
      .get();
  },

  create(
    profileId: string,
    content: ChallengeContent,
    prompt: string,
    contextSnapshot: Record<string, unknown> | null = null,
  ) {
    const id = crypto.randomUUID();
    const now = new Date();

    return db.transaction((tx) => {
      const nextNumber = tx
        .select({
          value: sql<number>`coalesce(max(${challenges.number}), 0) + 1`,
        })
        .from(challenges)
        .where(eq(challenges.profileId, profileId))
        .get()!.value;
      const challenge = tx
        .insert(challenges)
        .values({
          id,
          profileId,
          number: nextNumber,
          title: content.title,
          scope: content.scope,
          difficulty: content.difficulty,
          contextualDifficulty: content.contextualDifficulty,
          estimatedDifficultyScore: content.estimatedDifficultyScore,
          difficultyReason: content.difficultyReason,
          topic: content.topic,
          implementationBoundary: content.implementationBoundary,
          contextSnapshot,
          promptVersion: PROMPT_VERSION,
          calibrationVersion: CALIBRATION_VERSION,

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
        .get();

      tx.insert(messages)
        .values([
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
        ])
        .run();

      return challenge;
    });
  },

  setStatus(id: string, status: "active" | "paused" | "saved" | "stopped") {
    return db
      .update(challenges)
      .set({ status, completedAt: null, completionSource: null })
      .where(eq(challenges.id, id))
      .returning()
      .get();
  },
  complete(id: string) {
    return db
      .update(challenges)
      .set({
        status: "completed",
        completionSource: "user",
        completedAt: new Date(),
      })
      .where(eq(challenges.id, id))
      .returning()
      .get();
  },

  saveHint(id: string, hint: string, helpKind: "hint" | "approach" = "hint") {
    const now = new Date();

    return db.transaction((tx) => {
      const challenge = tx
        .update(challenges)
        .set({ hint })
        .where(eq(challenges.id, id))
        .returning()
        .get();

      tx.insert(messages)
        .values({
          id: crypto.randomUUID(),
          challengeId: id,
          role: "assistant",
          mode: "hint",
          content:
            helpKind === "approach" ? "High-level approach\n\n" + hint : hint,
          createdAt: now,
        })
        .run();

      return challenge;
    });
  },
};

export type ChallengeModel = typeof challengeModel;
