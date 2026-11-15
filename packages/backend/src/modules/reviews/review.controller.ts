import type { Context } from "hono";
import { AppError } from "../../shared/errors/app-error";
import { parseInput } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import { challengeParamsSchema } from "../challenges/challenge.schema";
import type { ReviewService } from "./review.service";

function profileId(c: Context) {
  const value = c.req.header("X-Profile-Id");
  if (!value)
    throw new AppError(
      "PROFILE_REQUIRED",
      "Enter your email to start using Grill-Me.",
      401,
    );
  return parseInput(profileIdSchema, value);
}

function challengeId(c: Context) {
  return parseInput(challengeParamsSchema, c.req.param()).id;
}

export function createReviewController(service: ReviewService) {
  return {
    list: async (c: Context) =>
      c.json({
        data: await service.list(challengeId(c), profileId(c)),
      }),
    create: async (c: Context) =>
      c.json({ data: await service.create(challengeId(c), profileId(c)) }, 201),
  };
}

export type ReviewController = ReturnType<typeof createReviewController>;
