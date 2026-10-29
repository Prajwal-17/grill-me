import { withModelSnapshot } from "../../local/model";
import { guidedPreferencesSchema } from "../profiles/profile.schema";
import { rm } from "node:fs/promises";
import { uploadInfo } from "../projects/uploads";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../shared/database/db";
import {
  challenges,
  profilePreferences,
  messages,
  projects,
  reviewJobs,
  submissions,
  verificationRuns,
} from "../../shared/database/schema";
import { AppError } from "../../shared/errors/app-error";
import { toChallenge, requireChallenge } from "../challenges/challenge.utils";
import { messageAttachmentSchema } from "../messages/message.schema";
import {
  captureSubmission,
  projectRoot,
  readSnapshot,
  readSnapshotFile,
} from "../projects/snapshot";
import type { VerificationEvidence } from "./review.schema";
import { validatedReview } from "./validated-review";
import type { JudgeInput, ModelGateway } from "../ai/model-gateway";
import { codexJudge } from "../judges/codex";
import { verifySubmission } from "../verification/runner";
import { PROMPT_VERSION } from "../ai/prompts/core";

export const submissionRequestSchema = z.object({
  uploadIds: z.array(z.string().uuid()).default([]),
  content: z.string().default(""),
  attachments: z.array(messageAttachmentSchema).default([]),
  projectId: z.string().uuid().nullable().default(null),
  subdirectory: z.string().default(""),
  baseRevision: z.string().default(""),
});
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type ReviewJob = typeof reviewJobs.$inferSelect;
export type SavedSubmission = typeof submissions.$inferSelect;
const owned = async (id: string, profileId: string) =>
  requireChallenge(
    (
      await db
        .select()
        .from(challenges)
        .where(and(eq(challenges.id, id), eq(challenges.profileId, profileId)))
    )[0],
  );
export function routeJudge(input: {
  scope: string;
  project: boolean;
  bytes: number;
  contentBytes: number;
}) {
  const contextTokens = Number(
    process.env.DIRECT_REVIEW_CONTEXT_TOKENS ?? 12000,
  );
  if (input.project && input.scope !== "focused")
    return {
      judge: "codex" as const,
      reason: "This project needs cross-file exploration.",
    };
  // Conservative routing estimate only. Submissions and snapshot files are never truncated or rejected by size.
  if ((input.bytes + input.contentBytes) / 3 > contextTokens * 0.65)
    return {
      judge: "codex" as const,
      reason: "Explore this submission incrementally within the model context.",
    };
  if (input.project)
    return {
      judge: "codex" as const,
      reason: "Inspect the connected project and its dependencies.",
    };
  return {
    judge: "omniroute" as const,
    reason:
      "The supplied exercise fits a direct review; unresolved dependencies will be reported as missing evidence.",
  };
}
export function createReviewService(
  llm: ModelGateway,
  judge = codexJudge,
  verifier = verifySubmission,
) {
  let chain: Promise<void> = Promise.resolve();
  const controls = new Map<string, AbortController>();
  const job = async (id: string) =>
    (await db.select().from(reviewJobs).where(eq(reviewJobs.id, id)))[0];
  const submission = async (id: string) =>
    (await db.select().from(submissions).where(eq(submissions.id, id)))[0];
  async function ownedJob(id: string, profileId: string) {
    const row = await job(id);
    const attempt = row && (await submission(row.submissionId));
    if (!row || !attempt)
      throw new AppError("REVIEW_NOT_FOUND", "Review not found.", 404);
    await owned(attempt.challengeId, profileId);
    return { row, attempt };
  }
  const update = async (
    id: string,
    values: Partial<typeof reviewJobs.$inferInsert>,
  ) => db.update(reviewJobs).set(values).where(eq(reviewJobs.id, id));
  async function run(id: string) {
    return withModelSnapshot(() => runSnapshot(id));
  }
  async function runSnapshot(id: string) {
    const row = await job(id);
    if (!row || row.status !== "queued") return;
    const attempt = (await submission(row.submissionId))!;
    const controller = new AbortController();
    controls.set(id, controller);
    await update(id, { status: "running", progress: "Preparing review" });
    try {
      const challenge = toChallenge(
        requireChallenge(
          (
            await db
              .select()
              .from(challenges)
              .where(eq(challenges.id, attempt.challengeId))
          )[0],
        ),
      );
      const evidence: VerificationEvidence = {
        status: "inspection_only",
        reason: "No execution evidence yet.",
        checks: [],
      };
      const previousReview = (
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
      )[0]?.response;
      const savedPreferences = (
        await db
          .select()
          .from(profilePreferences)
          .where(eq(profilePreferences.profileId, challenge.profileId))
      )[0];
      const input: JudgeInput = {
        codexModel: guidedPreferencesSchema.parse(
          savedPreferences?.guidedPreferences ?? {},
        ).codexModel,
        challenge,
        content:
          row.judge === "codex" && Buffer.byteLength(attempt.content) > 16384
            ? "The complete submission text is saved in " +
              attempt.manifest.find((f) =>
                /^_+grill_submission_notes\.txt$/.test(f.path),
              )!.path +
              ". Read it using the snapshot tools; no text has been discarded."
            : attempt.content,
        attachments:
          row.judge === "omniroute"
            ? await readSnapshot(attempt.snapshotPath, attempt.manifest)
            : [],
        assistance: attempt.assistance,
        evidence,
        followup: row.followup,
        previousReview,
        signal: controller.signal,
      };
      await update(id, { progress: "Checking verification environment" });
      input.evidence = await verifier(llm, input, attempt.snapshotPath);
      controller.signal.throwIfAborted();
      await update(id, {
        progress:
          row.judge === "codex"
            ? "Inspecting project files"
            : "Reviewing implementation",
      });
      const { result, score } = await validatedReview(
        input,
        async (input) =>
          row.judge === "codex"
            ? await judge(input, attempt.snapshotPath, (progress, ids) => {
                void update(id, {
                  progress,
                  ...(ids?.logId ? { aiLogId: ids.logId } : {}),
                  ...(ids?.threadId ? { providerThreadId: ids.threadId } : {}),
                  ...(ids?.turnId ? { providerTurnId: ids.turnId } : {}),
                });
              })
            : llm.judge
              ? await llm.judge(input)
              : (() => {
                  throw new Error(
                    "This model gateway does not support structured judging.",
                  );
                })(),
        () => update(id, { progress: "Correcting inconsistent review output" }),
      );
      controller.signal.throwIfAborted();
      await db.insert(verificationRuns).values({
        id: crypto.randomUUID(),
        reviewId: id,
        evidence: input.evidence,
      });
      await db.transaction(async (tx) => {
        await tx
          .update(reviewJobs)
          .set({
            status: "completed",
            progress: "Review complete",
            response: result,
            score,
            completedAt: new Date(),
          })
          .where(eq(reviewJobs.id, id));
      });
    } catch (error) {
      await update(id, {
        status: controller.signal.aborted ? "cancelled" : "failed",
        progress: controller.signal.aborted
          ? "Review cancelled"
          : "Review could not finish",
        error: error instanceof Error ? error.message : "Review failed",
        completedAt: new Date(),
      });
    } finally {
      controls.delete(id);
    }
  }
  async function enqueue(
    attempt: SavedSubmission,
    routing: { judge: "codex" | "omniroute"; reason: string },
    followup: string | null = null,
  ) {
    const id = crypto.randomUUID();
    const saved = (
      await db
        .insert(reviewJobs)
        .values({
          id,
          submissionId: attempt.id,
          judge: routing.judge,
          routingReason: routing.reason,
          status: "queued",
          progress: "Queued for review",
          promptVersion: PROMPT_VERSION,
          followup,
        })
        .returning()
    )[0]!;
    chain = chain.then(() => run(id)).catch(() => {});
    return saved;
  }
  return {
    async recover() {
      await db
        .update(reviewJobs)
        .set({
          status: "failed",
          progress: "Review interrupted by restart",
          error: "The backend restarted. Retry this saved submission.",
          completedAt: new Date(),
        })
        .where(inArray(reviewJobs.status, ["running", "queued"]));
    },
    async list(challengeId: string, profileId: string) {
      await owned(challengeId, profileId);
      const attempts = await db
        .select()
        .from(submissions)
        .where(eq(submissions.challengeId, challengeId))
        .orderBy(desc(submissions.sequence));
      return Promise.all(
        attempts.map(async (attempt) => ({
          ...attempt,
          reviews: await db
            .select()
            .from(reviewJobs)
            .where(eq(reviewJobs.submissionId, attempt.id))
            .orderBy(desc(reviewJobs.createdAt)),
        })),
      );
    },
    async file(id: string, profileId: string, path: string) {
      const attempt = await submission(id);
      if (!attempt)
        throw new AppError(
          "SUBMISSION_NOT_FOUND",
          "Submission not found.",
          404,
        );
      await owned(attempt.challengeId, profileId);
      return readSnapshotFile(attempt.snapshotPath, attempt.manifest, path);
    },
    async submit(
      challengeId: string,
      profileId: string,
      input: SubmissionRequest,
    ) {
      const challenge = await owned(challengeId, profileId);
      if (challenge.status !== "active" || challenge.archivedAt)
        throw new AppError(
          "CHALLENGE_INACTIVE",
          "Resume the challenge before submitting.",
          409,
        );
      const project = input.projectId
        ? (
            await db
              .select()
              .from(projects)
              .where(
                and(
                  eq(projects.id, input.projectId),
                  eq(projects.profileId, profileId),
                ),
              )
          )[0]
        : null;
      if (input.projectId && !project)
        throw new AppError(
          "PROJECT_NOT_FOUND",
          "Connected project not found.",
          404,
        );
      const id = crypto.randomUUID();
      const uploads = await Promise.all(
        input.uploadIds.map(async (uploadId) => {
          const info = await uploadInfo(profileId, uploadId);
          if (!info.sealed)
            throw new AppError(
              "UPLOAD_INCOMPLETE",
              "Finish uploading before submitting.",
              409,
            );
          return info;
        }),
      );
      const snapshot = await captureSubmission({
        id,
        root: project?.root,
        subdirectory: input.subdirectory,
        baseRevision: input.baseRevision,
        content: input.content,
        attachments: input.attachments,
        uploads,
      });
      if ((await owned(challengeId, profileId)).status !== "active") {
        await rm(snapshot.snapshotPath, { recursive: true, force: true });
        throw new AppError(
          "CHALLENGE_INACTIVE",
          "The challenge changed while its snapshot was being prepared. Check its current status before submitting.",
          409,
        );
      }
      const help = await db
        .select()
        .from(messages)
        .where(
          and(eq(messages.challengeId, challengeId), eq(messages.mode, "hint")),
        );
      const latest = (
        await db
          .select()
          .from(submissions)
          .where(eq(submissions.challengeId, challengeId))
          .orderBy(desc(submissions.sequence))
      )[0];
      const attempt = (
        await db
          .insert(submissions)
          .values({
            id,
            challengeId,
            sequence: (latest?.sequence ?? 0) + 1,
            contractVersion: challenge.contractVersion,
            content: input.content,
            attachments: [],
            projectId: project?.id ?? null,
            ...snapshot,
            assistance: {
              hints: help.length,
              guidance: help.some((m) =>
                m.content.startsWith("High-level approach"),
              ),
            },
          })
          .returning()
      )[0]!;
      const route = routeJudge({
        scope: challenge.scope,
        project:
          Boolean(project) ||
          uploads.some((file) => file.filename.includes("/")),
        bytes: snapshot.manifest.reduce((n, f) => n + f.bytes, 0),
        contentBytes: Buffer.byteLength(input.content),
      });
      return { submission: attempt, review: await enqueue(attempt, route) };
    },
    async retry(id: string, profileId: string, followup: string | null) {
      const { row, attempt } = await ownedJob(id, profileId);
      const challenge = await owned(attempt.challengeId, profileId);
      if (
        challenge.status === "paused" ||
        challenge.archivedAt ||
        challenge.status === "stopped" ||
        challenge.status === "saved"
      )
        throw new AppError(
          "CHALLENGE_INACTIVE",
          "Resume this challenge before requesting a review.",
          409,
        );
      if (row.status === "queued" || row.status === "running")
        throw new AppError(
          "REVIEW_RUNNING",
          "This review is still running.",
          409,
        );
      return enqueue(
        attempt,
        { judge: row.judge, reason: row.routingReason },
        followup,
      );
    },
    async cancel(id: string, profileId: string) {
      const { row } = await ownedJob(id, profileId);
      if (row.status === "running") controls.get(id)?.abort();
      else if (row.status === "queued")
        await update(id, {
          status: "cancelled",
          progress: "Review cancelled",
          completedAt: new Date(),
        });
      return job(id);
    },
    async get(id: string, profileId: string) {
      const { row } = await ownedJob(id, profileId);
      return {
        ...row,
        verificationRuns: await db
          .select()
          .from(verificationRuns)
          .where(eq(verificationRuns.reviewId, id)),
      };
    },
    async listProjects(profileId: string) {
      return db
        .select()
        .from(projects)
        .where(eq(projects.profileId, profileId));
    },
    async connect(profileId: string, path: string) {
      const root = await projectRoot(path);
      const existing = (
        await db
          .select()
          .from(projects)
          .where(
            and(eq(projects.profileId, profileId), eq(projects.root, root)),
          )
      )[0];
      return (
        existing ??
        (
          await db
            .insert(projects)
            .values({
              id: crypto.randomUUID(),
              profileId,
              root,
              name: root.split("/").filter(Boolean).at(-1)!,
            })
            .returning()
        )[0]!
      );
    },
    async progress(profileId: string) {
      const history = await db
        .select()
        .from(challenges)
        .where(eq(challenges.profileId, profileId));
      return (
        await Promise.all(
          history.map(async (challenge) => {
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
                number: challenge.number,
                title: challenge.title,
                topic: challenge.topic ?? "Unspecified",
                scope: challenge.scope,
                difficulty: challenge.difficulty,
                score: review.score,
                accepted: review.response.verdict === "accepted",
                assistance: attempt.assistance,
                createdAt: review.createdAt,
                gaps: review.response.findings.map((f) => f.issue),
              },
            ];
          }),
        )
      ).flat();
    },
  };
}
