import { Hono, type Context } from "hono";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { parseInput, readJson } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import {
  generateQuizRequestSchema,
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

export function createQuizRoutes(service: QuizService) {
  const routes = new Hono();
  const path = "/:id/quizzes";
  routes.get(path, async (c) =>
    c.json({ data: await service.list(id(c, "id"), profileId(c)) }),
  );
  routes.post(path + "/generate", async (c) =>
    c.json(
      {
        data: await service.generate(
          id(c, "id"),
          profileId(c),
          parseInput(generateQuizRequestSchema, await readJson(c.req.raw)),
        ),
      },
      201,
    ),
  );
  routes.get(path + "/:quizId", async (c) =>
    c.json({
      data: await service.detail(id(c, "id"), id(c, "quizId"), profileId(c)),
    }),
  );
  routes.post(path + "/:quizId/attempts", async (c) =>
    c.json(
      { data: await service.start(id(c, "id"), id(c, "quizId"), profileId(c)) },
      201,
    ),
  );
  for (const action of ["answers", "submit"] as const) {
    routes.post(path + "/:quizId/attempts/:attemptId/" + action, async (c) =>
      c.json({
        data: await service.save(
          id(c, "id"),
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
