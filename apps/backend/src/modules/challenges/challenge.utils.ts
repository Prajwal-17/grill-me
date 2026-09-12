import { AppError } from "../../shared/errors/app-error";
import type { ChallengeRow } from "./challenge.model";
import { challengeSchema, type Challenge } from "./challenge.schema";

export function toChallenge(row: ChallengeRow): Challenge {
  return challengeSchema.parse({
    ...row,
    durationEstimate: {
      minMinutes: row.durationMinMinutes,
      maxMinutes: row.durationMaxMinutes,
    },
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
}

export function requireChallenge(row: ChallengeRow | undefined) {
  if (!row) {
    throw new AppError("CHALLENGE_NOT_FOUND", "Build not found.", 404);
  }
  return row;
}

export function requireActiveChallenge(row: ChallengeRow) {
  if (row.status !== "active") {
    throw new AppError(
      "CHALLENGE_COMPLETED",
      "Completed builds are read-only.",
      409,
    );
  }
  return row;
}
