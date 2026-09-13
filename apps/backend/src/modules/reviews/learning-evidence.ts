import { and, desc, eq } from "drizzle-orm";
import { db } from "../../shared/database/db";
import {
  challenges,
  reviewJobs,
  submissions,
} from "../../shared/database/schema";
export function recentLearningEvidence(profileId: string) {
  const recent = db
    .select()
    .from(challenges)
    .where(eq(challenges.profileId, profileId))
    .orderBy(desc(challenges.createdAt))
    .limit(10)
    .all();
  return recent.flatMap((challenge) => {
    const attempt = db
      .select()
      .from(submissions)
      .where(eq(submissions.challengeId, challenge.id))
      .orderBy(desc(submissions.sequence))
      .get();
    if (!attempt) return [];
    const review = db
      .select()
      .from(reviewJobs)
      .where(
        and(
          eq(reviewJobs.submissionId, attempt.id),
          eq(reviewJobs.status, "completed"),
        ),
      )
      .orderBy(desc(reviewJobs.createdAt))
      .get();
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
  });
}
