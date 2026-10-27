import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "../../shared/database/db";
import { generationJobs } from "../../shared/database/schema";
import { AppError } from "../../shared/errors/app-error";
import type { ChallengeService } from "../challenges/challenge.service";
import type { ProfileService } from "../profiles/profile.service";
import type { QuizService } from "../quizzes/quiz.service";
import { lockGeneration, completeGeneration } from "./generation.lease";
import type { GenerationRequest, GenerationRun } from "./generation.schema";

type Job = typeof generationJobs.$inferSelect;
const LEASE_MS = 90_000;
const RUN_TIMEOUT_MS = 15 * 60_000;
const pendingStates = ["queued", "running", "needs_input"] as const;

function publicJob(job: Job) {
  return {
    id: job.id,
    profileId: job.profileId,
    kind: job.kind,
    challengeId: job.challengeId,
    request: job.request,
    status: job.status,
    phase: job.phase,
    clarification: job.clarification,
    error: job.error,
    resultId: job.resultId,
    resultTitle: job.resultTitle,
    resultNumber: job.resultNumber,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    notifiedAt: job.notifiedAt?.toISOString() ?? null,
  };
}
export type PublicGenerationJob = ReturnType<typeof publicJob>;

export function createGenerationService(dependencies: {
  profiles: ProfileService;
  challenges: ChallengeService;
  quizzes: QuizService;
}) {
  const { profiles, challenges, quizzes } = dependencies;
  let timer: ReturnType<typeof setInterval> | undefined;
  const controllers = new Map<string, AbortController>();
  let active = 0;
  let pumping = false;
  const get = async (id: string) =>
    (
      await db.select().from(generationJobs).where(eq(generationJobs.id, id))
    )[0];
  async function owned(id: string, profileId: string) {
    await profiles.assertExists(profileId);
    const job = await get(id);
    if (!job || job.profileId !== profileId)
      throw new AppError("GENERATION_NOT_FOUND", "Generation not found.", 404);
    return job;
  }
  const runScope = (run: GenerationRun) =>
    and(
      eq(generationJobs.id, run.id),
      eq(generationJobs.runToken, run.token),
      eq(generationJobs.status, "running"),
    );
  async function phase(run: GenerationRun, value: Job["phase"]) {
    const changed = await db
      .update(generationJobs)
      .set({ phase: value, updatedAt: new Date() })
      .where(runScope(run))
      .returning({ id: generationJobs.id });
    if (!changed.length)
      throw new AppError(
        "GENERATION_INTERRUPTED",
        "This generation was interrupted.",
        409,
        true,
      );
  }
  async function claim() {
    return db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.status, "queued"))
        .orderBy(asc(generationJobs.createdAt), asc(generationJobs.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!job) return null;
      const [claimed] = await tx
        .update(generationJobs)
        .set({
          status: "running",
          runToken: crypto.randomUUID(),
          leaseUntil: new Date(Date.now() + LEASE_MS),
          updatedAt: new Date(),
        })
        .where(eq(generationJobs.id, job.id))
        .returning();
      return claimed!;
    });
  }
  async function run(job: Job) {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    const lease = {
      id: job.id,
      token: job.runToken!,
      signal: controller.signal,
    };
    const heartbeat = setInterval(() => {
      void db
        .update(generationJobs)
        .set({ leaseUntil: new Date(Date.now() + LEASE_MS) })
        .where(runScope(lease))
        .returning({ id: generationJobs.id })
        .then((rows) => {
          if (!rows.length) controller.abort();
        })
        .catch((error) => console.error("Generation heartbeat failed", error));
    }, 15_000);
    heartbeat.unref();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const execute = async () => {
        const request = job.request;
        if (request.kind === "challenge") {
          if (
            !job.skipPreparation &&
            !request.input.clarificationHistory.length &&
            !request.input.clarificationContext
          ) {
            await phase(lease, "preparing");
            const preparation = await challenges.prepare(
              request.input,
              job.profileId,
              controller.signal,
            );
            if (preparation.question) {
              await db
                .update(generationJobs)
                .set({
                  status: "needs_input",
                  clarification: {
                    question: preparation.question,
                    options: preparation.options,
                  },
                  updatedAt: new Date(),
                  runToken: null,
                  leaseUntil: null,
                  notifiedAt: null,
                })
                .where(runScope(lease));
              return;
            }
          }
          await phase(lease, "generating");
          const result = await challenges.generate(
            request.input,
            job.profileId,
            lease,
          );
          return result;
        }
        await phase(lease, "generating");
        return quizzes.generate(
          request.kind === "challenge_quiz" ? request.challengeId : null,
          job.profileId,
          request.input,
          lease,
        );
      };
      const result = await Promise.race([
        execute(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            "abort",
            () =>
              reject(
                new AppError(
                  "GENERATION_INTERRUPTED",
                  "Generation stopped.",
                  409,
                ),
              ),
            { once: true },
          );
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new AppError(
                  "GENERATION_TIMEOUT",
                  "Generation took too long. Try again.",
                  504,
                  true,
                ),
              ),
            RUN_TIMEOUT_MS,
          );
          timeout.unref();
        }),
      ]);
      // Services save the result and completed state atomically. This also
      // handles a quiz already created by an overlapping idempotent request.
      if (result && (await get(job.id))?.status === "running") {
        await db.transaction(async (tx) => {
          await lockGeneration(tx, lease);
          await completeGeneration(tx, lease, result);
        });
      }
    } catch (error) {
      const known = error instanceof AppError;
      if (
        known &&
        error.code === "CHALLENGE_NEEDS_CLARIFICATION" &&
        typeof error.details?.question === "string"
      ) {
        await db
          .update(generationJobs)
          .set({
            status: "needs_input",
            clarification: {
              question: error.details.question,
              options: Array.isArray(error.details.options)
                ? (error.details.options as string[])
                : [],
            },
            updatedAt: new Date(),
            notifiedAt: null,
            runToken: null,
            leaseUntil: null,
          })
          .where(runScope(lease));
      } else {
        if (!known) console.error("Background generation failed", error);
        await db
          .update(generationJobs)
          .set({
            status: "failed",
            error: {
              code: known ? error.code : "GENERATION_FAILED",
              message: known ? error.message : "Generation failed. Try again.",
              retryable: known
                ? error.retryable || error.code === "MODEL_UNAVAILABLE"
                : true,
            },
            completedAt: new Date(),
            updatedAt: new Date(),
            notifiedAt: null,
            runToken: null,
            leaseUntil: null,
          })
          .where(runScope(lease));
      }
    } finally {
      controller.abort();
      controllers.delete(job.id);
      clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
    }
  }
  async function recover() {
    // Never silently repeat a paid call after a worker disappears. Queued jobs
    // resume; expired running jobs become retryable, with late saves fenced out.
    await db
      .update(generationJobs)
      .set({
        status: "failed",
        error: {
          code: "GENERATION_INTERRUPTED",
          message: "Generation was interrupted. Retry when you’re ready.",
          retryable: true,
        },
        updatedAt: new Date(),
        completedAt: new Date(),
        notifiedAt: null,
        runToken: null,
        leaseUntil: null,
      })
      .where(
        and(
          eq(generationJobs.status, "running"),
          lt(generationJobs.leaseUntil, new Date()),
        ),
      );
  }
  async function processNext() {
    const job = await claim();
    if (!job) return false;
    await run(job);
    return true;
  }
  async function pump() {
    if (pumping || !timer) return;
    pumping = true;
    try {
      await recover();
      while (timer && active < 2) {
        const job = await claim();
        if (!job) break;
        active++;
        void run(job)
          .catch((error) => console.error("Generation worker failed", error))
          .finally(() => {
            active--;
            void pump();
          });
      }
    } catch (error) {
      console.error("Generation queue unavailable", error);
    } finally {
      pumping = false;
    }
  }
  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void pump(), 1000);
      timer.unref();
      void pump();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    processNext,
    recover,
    async enqueue(profileId: string, request: GenerationRequest) {
      await profiles.assertExists(profileId);
      if (request.kind === "challenge_quiz")
        await challenges.owned(request.challengeId, profileId);
      const requestId =
        request.kind === "challenge"
          ? request.requestId
          : request.input.requestId;
      const [inserted] = await db
        .insert(generationJobs)
        .values({
          id: crypto.randomUUID(),
          profileId,
          requestId,
          kind: request.kind,
          challengeId:
            request.kind === "challenge_quiz" ? request.challengeId : null,
          request,
        })
        .onConflictDoNothing({
          target: [generationJobs.profileId, generationJobs.requestId],
        })
        .returning();
      const job =
        inserted ??
        (
          await db
            .select()
            .from(generationJobs)
            .where(
              and(
                eq(generationJobs.profileId, profileId),
                eq(generationJobs.requestId, requestId),
              ),
            )
        )[0]!;
      if (job.kind !== request.kind)
        throw new AppError(
          "GENERATION_REQUEST_CONFLICT",
          "This request ID belongs to a different generation.",
          409,
        );
      void pump();
      return publicJob(job);
    },
    async list(profileId: string) {
      await profiles.assertExists(profileId);
      const outstanding = await db
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.profileId, profileId),
            or(
              inArray(generationJobs.status, [...pendingStates]),
              isNull(generationJobs.notifiedAt),
            ),
          ),
        )
        .orderBy(desc(generationJobs.createdAt));
      const recent = await db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.profileId, profileId))
        .orderBy(desc(generationJobs.createdAt))
        .limit(20);
      return [
        ...new Map(
          [...outstanding, ...recent].map((job) => [job.id, job]),
        ).values(),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(publicJob);
    },
    async detail(id: string, profileId: string) {
      return publicJob(await owned(id, profileId));
    },
    async acknowledge(
      id: string,
      profileId: string,
      status: Job["status"],
      updatedAt: Date,
    ) {
      await owned(id, profileId);
      await db
        .update(generationJobs)
        .set({ notifiedAt: new Date() })
        .where(
          and(
            eq(generationJobs.id, id),
            eq(generationJobs.profileId, profileId),
            eq(generationJobs.status, status),
            eq(generationJobs.updatedAt, updatedAt),
            inArray(generationJobs.status, [
              "completed",
              "failed",
              "needs_input",
              "cancelled",
            ]),
          ),
        );
      return { acknowledged: true };
    },
    async answer(
      id: string,
      profileId: string,
      question: string,
      answer: string,
    ) {
      await owned(id, profileId);
      const result = await db.transaction(async (tx) => {
        const [job] = await tx
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, id))
          .for("update");
        if (!job || job.request.kind !== "challenge")
          throw new AppError(
            "GENERATION_NOT_FOUND",
            "Generation not found.",
            404,
          );
        const request = job.request;
        if (job.status !== "needs_input") {
          if (
            request.input.clarificationHistory.some(
              (entry) => entry.question === question && entry.answer === answer,
            )
          )
            return job;
          throw new AppError(
            "GENERATION_NOT_WAITING",
            "This generation is not waiting for an answer.",
            409,
          );
        }
        if (job.clarification?.question !== question)
          throw new AppError(
            "GENERATION_QUESTION_CHANGED",
            "The clarification changed. Reload and answer the current question.",
            409,
          );
        if (request.input.clarificationHistory.length >= 20)
          throw new AppError(
            "GENERATION_CLARIFICATION_LIMIT",
            "Edit your request to resolve the remaining requirements.",
            409,
          );
        const context = { question, answer };
        const [updated] = await tx
          .update(generationJobs)
          .set({
            status: "queued",
            phase: "queued",
            clarification: null,
            error: null,
            skipPreparation: true,
            request: {
              ...request,
              input: {
                ...request.input,
                clarificationContext: context,
                clarificationHistory: [
                  ...request.input.clarificationHistory,
                  context,
                ],
              },
            },
            updatedAt: new Date(),
            notifiedAt: null,
            completedAt: null,
          })
          .where(eq(generationJobs.id, id))
          .returning();
        return updated!;
      });
      void pump();
      return publicJob(result);
    },
    async retry(id: string, profileId: string, skipPreparation: boolean) {
      const job = await owned(id, profileId);
      if (job.status === "queued" || job.status === "running")
        return publicJob(job);
      if (job.status !== "failed" || !job.error?.retryable)
        throw new AppError(
          "GENERATION_CANNOT_RETRY",
          "This generation cannot be retried.",
          409,
        );
      if (
        skipPreparation &&
        (job.kind !== "challenge" || job.phase !== "preparing")
      )
        throw new AppError(
          "GENERATION_CANNOT_SKIP",
          "An essential clarification cannot be skipped.",
          409,
        );
      const [updated] = await db
        .update(generationJobs)
        .set({
          status: "queued",
          phase: "queued",
          error: null,
          skipPreparation: job.skipPreparation || skipPreparation,
          updatedAt: new Date(),
          notifiedAt: null,
          completedAt: null,
        })
        .where(
          and(eq(generationJobs.id, id), eq(generationJobs.status, "failed")),
        )
        .returning();
      void pump();
      return publicJob(updated ?? (await owned(id, profileId)));
    },
    async cancel(id: string, profileId: string) {
      await owned(id, profileId);
      const [job] = await db
        .update(generationJobs)
        .set({
          status: "cancelled",
          runToken: null,
          leaseUntil: null,
          updatedAt: new Date(),
          completedAt: new Date(),
          notifiedAt: new Date(),
        })
        .where(
          and(
            eq(generationJobs.id, id),
            inArray(generationJobs.status, [
              "queued",
              "running",
              "needs_input",
            ]),
          ),
        )
        .returning();
      if (!job)
        throw new AppError(
          "GENERATION_ALREADY_FINISHED",
          "This generation has already finished.",
          409,
        );
      controllers.get(id)?.abort();
      return publicJob(job);
    },
  };
}
export type GenerationService = ReturnType<typeof createGenerationService>;
