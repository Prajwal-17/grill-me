import { Hono, type Context } from "hono";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { parseInput, readJson } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import {
  generateQuizRequestSchema,
  generateStandaloneQuizRequestSchema,
  saveQuizAnswersSchema,
} from "./quiz.schema";
import type { QuizService } from "./quiz.service";

function profileId(c: Context) {
  const value = c.req.header("X-Profile-Id");
  if (!value)
    throw new AppError(
      "PROFILE_REQUIRED",
      "Choose a profile to use quizzes.",
      401,
    );
  return parseInput(profileIdSchema, value);
}
function id(c: Context, name: string) {
  return parseInput(z.string().uuid(), c.req.param(name));
}

export function createQuizRoutes(service: QuizService, standalone = false) {
  const routes = new Hono();
  const path = standalone ? "" : "/:id/quizzes";
  const challengeId = (c: Context) => (standalone ? null : id(c, "id"));
  routes.get(path || "/", async (c) =>
    c.json({ data: await service.list(challengeId(c), profileId(c)) }),
  );
  routes.post(path + "/generate", async (c) =>
    c.json(
      {
        data: await service.generate(
          challengeId(c),
          profileId(c),
          standalone
            ? parseInput(
                generateStandaloneQuizRequestSchema,
                await readJson(c.req.raw),
              )
            : parseInput(generateQuizRequestSchema, await readJson(c.req.raw)),
        ),
      },
      201,
    ),
  );
  routes.get(path + "/:quizId", async (c) =>
    c.json({
      data: await service.detail(challengeId(c), id(c, "quizId"), profileId(c)),
    }),
  );
  routes.post(path + "/:quizId/attempts", async (c) =>
    c.json(
      {
        data: await service.start(
          challengeId(c),
          id(c, "quizId"),
          profileId(c),
        ),
      },
      201,
    ),
  );
  for (const action of ["answers", "submit"] as const) {
    routes.post(path + "/:quizId/attempts/:attemptId/" + action, async (c) =>
      c.json({
        data: await service.save(
          challengeId(c),
          id(c, "quizId"),
          id(c, "attemptId"),
          profileId(c),
          parseInput(saveQuizAnswersSchema, await readJson(c.req.raw)),
          action === "submit",
        ),
      }),
    );
  }
  return routes;
}
