import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { ModelGateway, QuizModelInput } from "../ai/model-gateway";
import type { ProfileService } from "../profiles/profile.service";
import { quizPrompt, QUIZ_PROMPT_VERSION } from "../ai/prompts/generate-quiz";
import type { ChallengeService } from "../challenges/challenge.service";
import { toChallenge } from "../challenges/challenge.utils";
import { db } from "../../shared/database/db";
import {
  challenges,
  profiles,
  quizAttempts,
  quizzes,
} from "../../shared/database/schema";
import { AppError } from "../../shared/errors/app-error";
import {
  validateQuiz,
  type GenerateQuizRequest,
  type GenerateStandaloneQuizRequest,
  type SaveQuizAnswers,
} from "./quiz.schema";

type QuizRow = typeof quizzes.$inferSelect;
type AttemptRow = typeof quizAttempts.$inferSelect;

function publicQuiz(quiz: QuizRow) {
  return {
    id: quiz.id,
    challengeId: quiz.challengeId,
    topic: quiz.topic,
    prompt: quiz.challengeId === null ? quiz.topic : null,
    difficulty: quiz.difficulty,
    number: quiz.number,
    questionCount: quiz.questionCount,
    coverage: quiz.coverage,
    createdAt: quiz.createdAt.toISOString(),
    questions: quiz.questions.map(({ id, question, options }) => ({
      id,
      question,
      options,
    })),
  };
}

function publicAttempt(attempt: AttemptRow, quiz: QuizRow) {
  return {
    ...attempt,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    results:
      attempt.status === "submitted"
        ? quiz.questions.map((q) => ({
            questionId: q.id,
            chosenOption: attempt.answers[q.id],
            correctOption: q.correctOption,
            explanation: q.explanation,
          }))
        : null,
  };
}

export function createQuizService(
  llm: ModelGateway,
  challengeService: ChallengeService,
  profileService: ProfileService,
) {
  const generating = new Map<string, Promise<ReturnType<typeof publicQuiz>>>();

  function scope(challengeId: string | null, profileId: string) {
    return and(
      eq(quizzes.profileId, profileId),
      challengeId === null
        ? isNull(quizzes.challengeId)
        : eq(quizzes.challengeId, challengeId),
    );
  }

  async function assertScope(challengeId: string | null, profileId: string) {
    if (challengeId !== null)
      await challengeService.owned(challengeId, profileId);
    else await profileService.assertExists(profileId);
  }

  async function owned(
    challengeId: string | null,
    quizId: string,
    profileId: string,
  ) {
    await assertScope(challengeId, profileId);
    const quiz = (
      await db
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, quizId), scope(challengeId, profileId)))
    )[0];
    if (!quiz) throw new AppError("QUIZ_NOT_FOUND", "Quiz not found.", 404);
    return quiz;
  }

  return {
    async list(challengeId: string | null, profileId: string) {
      await assertScope(challengeId, profileId);
      const rows = await db
        .select()
        .from(quizzes)
        .where(scope(challengeId, profileId))
        .orderBy(desc(quizzes.number));
      const attempts = await db
        .select({ attempt: quizAttempts })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
        .where(scope(challengeId, profileId))
        .orderBy(desc(quizAttempts.number));
      return rows.map((quiz) => {
        const latest = attempts.find(
          ({ attempt }) => attempt.quizId === quiz.id,
        )?.attempt;
        const { questions: _questions, ...summary } = publicQuiz(quiz);
        return {
          ...summary,
          latestAttempt: latest
            ? {
                number: latest.number,
                status: latest.status,
                answered: Object.keys(latest.answers).length,
                score: latest.score,
              }
            : null,
        };
      });
    },

    async generate(
      challengeId: string | null,
      profileId: string,
      request: GenerateQuizRequest | GenerateStandaloneQuizRequest,
    ) {
      const challenge =
        challengeId === null
          ? null
          : toChallenge(await challengeService.owned(challengeId, profileId));
      if (!challenge) await profileService.assertExists(profileId);
      const key = profileId + ":" + challengeId + ":" + request.requestId;
      const existing = (
        await db
          .select()
          .from(quizzes)
          .where(
            and(
              scope(challengeId, profileId),
              eq(quizzes.requestId, request.requestId),
            ),
          )
      )[0];
      if (existing) return publicQuiz(existing);
      const running = generating.get(key);
      if (running) return running;
      const run = (async () => {
        if (!llm.generateQuiz)
          throw new AppError(
            "QUIZ_UNAVAILABLE",
            "This model does not support quiz generation.",
            503,
          );
        const earlier = await db
          .select({ questions: quizzes.questions })
          .from(quizzes)
          .where(
            and(
              scope(challengeId, profileId),
              "prompt" in request
                ? eq(quizzes.topic, request.prompt)
                : undefined,
            ),
          )
          .orderBy(desc(quizzes.number))
          .limit(3);
        const previousQuestions = earlier.flatMap((quiz) =>
          quiz.questions.map((q) => q.question),
        );
        let input: QuizModelInput;
        if (challenge && "coverage" in request) {
          input = { challenge, ...request, previousQuestions };
        } else if (!challenge && "prompt" in request) {
          input = {
            challenge: null,
            profileId,
            ...request,
            coverage: "topic",
            preferences: await profileService.getPreferences(profileId),
            previousQuestions,
          };
        } else {
          throw new AppError(
            "INVALID_INPUT",
            "Quiz settings do not match its scope.",
            400,
          );
        }
        const generated = await llm.generateQuiz(input);
        let content;
        try {
          content = validateQuiz(generated, request.questionCount);
        } catch {
          throw new AppError(
            "MODEL_OUTPUT_INVALID",
            "The model returned an invalid quiz. Try again.",
            502,
            true,
          );
        }
        return db.transaction(async (tx) => {
          if (challengeId !== null) {
            await tx
              .select({ id: challenges.id })
              .from(challenges)
              .where(eq(challenges.id, challengeId))
              .for("update");
          } else {
            await tx
              .select({ id: profiles.id })
              .from(profiles)
              .where(eq(profiles.id, profileId))
              .for("update");
          }
          const duplicate = (
            await tx
              .select()
              .from(quizzes)
              .where(
                and(
                  scope(challengeId, profileId),
                  eq(quizzes.requestId, request.requestId),
                ),
              )
          )[0];
          if (duplicate) return publicQuiz(duplicate);
          const number = (
            await tx
              .select({
                value: sql<number>`coalesce(max(${quizzes.number}), 0) + 1`,
              })
              .from(quizzes)
              .where(scope(challengeId, profileId))
          )[0]!.value;
          const quiz = (
            await tx
              .insert(quizzes)
              .values({
                id: crypto.randomUUID(),
                challengeId,
                profileId,
                // The existing text column also stores full standalone prompts.
                topic: input.challenge ? null : input.prompt,
                difficulty: input.challenge ? null : input.difficulty,
                number,
                requestId: request.requestId,
                questionCount: request.questionCount,
                coverage: input.coverage,
                questions: content.questions.map((q) => ({
                  ...q,
                  id: crypto.randomUUID(),
                })),
                contextSnapshot: JSON.parse(quizPrompt(input).input),
                promptVersion: QUIZ_PROMPT_VERSION,
              })
              .returning()
          )[0]!;
          return publicQuiz(quiz);
        });
      })();
      generating.set(key, run);
      try {
        return await run;
      } finally {
        generating.delete(key);
      }
    },

    async detail(
      challengeId: string | null,
      quizId: string,
      profileId: string,
    ) {
      const quiz = await owned(challengeId, quizId, profileId);
      const attempts = await db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.quizId, quiz.id))
        .orderBy(desc(quizAttempts.number));
      return {
        quiz: publicQuiz(quiz),
        attempts: attempts.map((attempt) => publicAttempt(attempt, quiz)),
      };
    },

    async start(challengeId: string | null, quizId: string, profileId: string) {
      const quiz = await owned(challengeId, quizId, profileId);
      return db.transaction(async (tx) => {
        await tx
          .select({ id: quizzes.id })
          .from(quizzes)
          .where(eq(quizzes.id, quizId))
          .for("update");
        const draft = (
          await tx
            .select()
            .from(quizAttempts)
            .where(
              and(
                eq(quizAttempts.quizId, quizId),
                eq(quizAttempts.status, "draft"),
              ),
            )
        )[0];
        if (draft) return publicAttempt(draft, quiz);
        const number = (
          await tx
            .select({
              value: sql<number>`coalesce(max(${quizAttempts.number}), 0) + 1`,
            })
            .from(quizAttempts)
            .where(eq(quizAttempts.quizId, quizId))
        )[0]!.value;
        const attempt = (
          await tx
            .insert(quizAttempts)
            .values({ id: crypto.randomUUID(), quizId, number })
            .returning()
        )[0]!;
        return publicAttempt(attempt, quiz);
      });
    },

    async save(
      challengeId: string | null,
      quizId: string,
      attemptId: string,
      profileId: string,
      input: SaveQuizAnswers,
      submit = false,
    ) {
      const quiz = await owned(challengeId, quizId, profileId);
      return db.transaction(async (tx) => {
        const attempt = (
          await tx
            .select()
            .from(quizAttempts)
            .where(
              and(
                eq(quizAttempts.id, attemptId),
                eq(quizAttempts.quizId, quizId),
              ),
            )
            .for("update")
        )[0];
        if (!attempt)
          throw new AppError(
            "QUIZ_ATTEMPT_NOT_FOUND",
            "Attempt not found.",
            404,
          );
        if (attempt.status === "submitted") {
          if (submit) return publicAttempt(attempt, quiz);
          throw new AppError(
            "QUIZ_SUBMITTED",
            "This attempt has already been submitted. Start a new attempt.",
            409,
          );
        }
        if (input.revision !== attempt.revision)
          throw new AppError(
            "QUIZ_SAVE_CONFLICT",
            "Answers changed in another tab. Reload this attempt before saving.",
            409,
          );
        const questionIds = new Set(quiz.questions.map((q) => q.id));
        if (Object.keys(input.answers).some((id) => !questionIds.has(id)))
          throw new AppError(
            "INVALID_QUIZ_ANSWER",
            "An answer does not belong to this quiz.",
            400,
          );
        if (submit && Object.keys(input.answers).length !== quiz.questionCount)
          throw new AppError(
            "QUIZ_INCOMPLETE",
            "Answer every question before submitting.",
            400,
          );
        const saved = (
          await tx
            .update(quizAttempts)
            .set({
              answers: input.answers,
              revision: attempt.revision + 1,
              updatedAt: new Date(),
              ...(submit
                ? {
                    status: "submitted" as const,
                    submittedAt: new Date(),
                    score: quiz.questions.filter(
                      (q) => input.answers[q.id] === q.correctOption,
                    ).length,
                  }
                : {}),
            })
            .where(eq(quizAttempts.id, attemptId))
            .returning()
        )[0]!;
        return publicAttempt(saved, quiz);
      });
    },
  };
}

export type QuizService = ReturnType<typeof createQuizService>;
