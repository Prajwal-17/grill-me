import { and, desc, eq } from "drizzle-orm";
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
          eq(challenges.status, "active"),
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
          eq(challenges.status, "completed"),
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

  create(profileId: string, content: ChallengeContent, prompt: string) {
    const id = crypto.randomUUID();
    const now = new Date();

    return db.transaction((tx) => {
      const challenge = tx
        .insert(challenges)
        .values({
          id,
          profileId,
          ...content,
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
              "Your challenge is ready: **" +
              content.title +
              "**. Ask me anything about the requirements when you get stuck.",
            createdAt: new Date(now.getTime() + 1),
          },
        ])
        .run();

      return challenge;
    });
  },

  complete(id: string) {
    return db
      .update(challenges)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(challenges.id, id))
      .returning()
      .get();
  },

  saveHint(id: string, hint: string) {
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
          content: hint,
          createdAt: now,
        })
        .run();

      return challenge;
    });
  },
};

export type ChallengeModel = typeof challengeModel;
