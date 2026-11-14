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
import {
  db,
  first,
  databaseNow,
  nextGenerationNumber,
} from "../../shared/database/db";
import { challenges, messages } from "../../shared/database/schema";
import type { ChallengeContent } from "./challenge.schema";
import type { GenerationRun } from "../generations/generation.schema";
import {
  lockGeneration,
  completeGeneration,
} from "../generations/generation.lease";

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
    generation?: GenerationRun,
  ) {
    const id = generation?.id ?? crypto.randomUUID();
    const now = new Date();

    return db.transaction(async (tx) => {
      await lockGeneration(tx, generation);
      const challenge = (
        await tx
          .insert(challenges)
          .values({
            id,
            profileId,
            number: await nextGenerationNumber(tx, profileId, "challenge"),
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

      await completeGeneration(tx, generation, challenge);

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
            ? {
                archivedAt: sql`coalesce(${challenges.archivedAt}, ${databaseNow()})`,
              }
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

  setWorkspacePath(id: string, workspacePath: string) {
    return first(
      db
        .update(challenges)
        .set({ workspacePath })
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
