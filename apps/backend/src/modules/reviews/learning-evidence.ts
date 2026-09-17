import { and, desc, eq } from "drizzle-orm";
import { db } from "../../shared/database/db";
import {
  challenges,
  reviewJobs,
  submissions,
} from "../../shared/database/schema";
export async function recentLearningEvidence(profileId: string) {
  const recent = await db
    .select()
    .from(challenges)
    .where(eq(challenges.profileId, profileId))
    .orderBy(desc(challenges.createdAt))
    .limit(10);
  return (
    await Promise.all(
      recent.map(async (challenge) => {
        const attempt = (
          await db
            .select()
            .from(submissions)
            .where(eq(submissions.challengeId, challenge.id))
            .orderBy(desc(submissions.sequence))
        )[0];
        if (!attempt) return [];
        const review = (
          await db
            .select()
            .from(reviewJobs)
            .where(
              and(
                eq(reviewJobs.submissionId, attempt.id),
                eq(reviewJobs.status, "completed"),
              ),
            )
            .orderBy(desc(reviewJobs.createdAt))
        )[0];
        if (!review?.response) return [];
        return [
          {
            challengeId: challenge.id,
            reviewId: review.id,
            topic: challenge.topic,
            difficulty: challenge.difficulty,
            verdict: review.response.verdict,
            assistance: attempt.assistance,
            findings: review.response.findings.map((f) => ({
              criterion: f.criterionId,
              issue: f.issue,
            })),
          },
        ];
      }),
    )
  ).flat();
}
