import type { Context } from "hono";
import { AppError } from "../../shared/errors/app-error";
import { parseInput } from "../../shared/http/validation";
import { challengeParamsSchema } from "../challenges/challenge.schema";
import { profileIdSchema } from "../profiles/profile.schema";
import type { MessageService } from "./message.service";
import { removedHelpFeature } from "./removed-help";

function profileId(c: Context) {
  const value = c.req.header("X-Profile-Id");
  if (!value) {
    throw new AppError(
      "PROFILE_REQUIRED",
      "Enter your email to start using Grill-Me.",
      401,
    );
  }
  return parseInput(profileIdSchema, value);
}

function challengeId(c: Context) {
  return parseInput(challengeParamsSchema, c.req.param()).id;
}

export function createMessageController(service: MessageService) {
  return {
    list: async (c: Context) =>
      c.json({ data: await service.list(challengeId(c), profileId(c)) }),

    create: async (c: Context) => {
      await service.assertAccess(challengeId(c), profileId(c));
      return removedHelpFeature();
    },
    retry: async (c: Context) => {
      await service.assertAccess(challengeId(c), profileId(c));
      return removedHelpFeature();
    },
  };
}
export type MessageController = ReturnType<typeof createMessageController>;
