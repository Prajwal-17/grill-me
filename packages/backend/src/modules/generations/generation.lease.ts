import { and, eq, gt } from "drizzle-orm";
import { type db, lockRows } from "../../shared/database/db";
import { generationJobs } from "../../shared/database/schema";
import { AppError } from "../../shared/errors/app-error";
import type { GenerationRun } from "./generation.schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Lock and verify the lease in the same transaction that saves the result.
// A worker that lost its lease cannot save a late or duplicate generation.
export async function lockGeneration(tx: Transaction, run?: GenerationRun) {
  if (!run) return;
  const [job] = await lockRows(
    tx
      .select({ id: generationJobs.id })
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.id, run.id),
          eq(generationJobs.runToken, run.token),
          eq(generationJobs.status, "running"),
          gt(generationJobs.leaseUntil, new Date()),
        ),
      ),
    "update",
  );
  if (!job)
    throw new AppError(
      "GENERATION_INTERRUPTED",
      "This generation is no longer running.",
      409,
      true,
    );
}

export async function completeGeneration(
  tx: Transaction,
  run: GenerationRun | undefined,
  result: { id: string; title: string; number: number },
) {
  if (!run) return;
  await tx
    .update(generationJobs)
    .set({
      status: "completed",
      phase: "completed",
      resultId: result.id,
      resultTitle: result.title,
      resultNumber: result.number,
      completedAt: new Date(),
      updatedAt: new Date(),
      leaseUntil: null,
      runToken: null,
      error: null,
      notifiedAt: null,
    })
    .where(
      and(
        eq(generationJobs.id, run.id),
        eq(generationJobs.runToken, run.token),
      ),
    );
}
