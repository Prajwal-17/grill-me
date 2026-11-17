import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../shared/database/db";
import { challengeReviews, harnessThreads } from "../../shared/database/schema";
import type { ChallengeReviewResult } from "@repo/backend/shared/contracts";

export type ChallengeReviewRow = typeof challengeReviews.$inferSelect;

export const reviewModel = {
  async attemptNumbers(profileId: string, challengeId: string) {
    const threads = await db
      .select({ id: harnessThreads.id })
      .from(harnessThreads)
      .where(
        and(
          eq(harnessThreads.profileId, profileId),
          eq(harnessThreads.challengeId, challengeId),
          eq(harnessThreads.kind, "review"),
        ),
      )
      .orderBy(asc(harnessThreads.createdAt), asc(harnessThreads.id));
    return new Map(threads.map((thread, index) => [thread.id, index + 1]));
  },
  list(profileId: string, challengeId: string) {
    return db
      .select()
      .from(challengeReviews)
      .where(
        and(
          eq(challengeReviews.profileId, profileId),
          eq(challengeReviews.challengeId, challengeId),
        ),
      )
      .orderBy(desc(challengeReviews.createdAt));
  },

  async create(values: {
    profileId: string;
    challengeId: string;
    verdict: "meets" | "partly_meets" | "does_not_meet";
    criteriaMet: number;
    criteriaTotal: number;
    result: ChallengeReviewResult;
    model: string;
    threadId: string | null;
  }) {
    const rows = await db
      .insert(challengeReviews)
      .values({ id: crypto.randomUUID(), ...values })
      .returning();
    return rows[0]!;
  },
};

export type ReviewModel = typeof reviewModel;
