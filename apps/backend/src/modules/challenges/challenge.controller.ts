import type { Context } from "hono";
import { AppError } from "../../shared/errors/app-error";
import { streamNdjson } from "../../shared/http/ndjson-stream";
import { parseInput, readJson } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import type { ChallengeService } from "./challenge.service";
import {
  challengeParamsSchema,
  generateChallengeRequestSchema,
} from "./challenge.schema";

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

export function createChallengeController(service: ChallengeService) {
  return {
    active: (c: Context) => c.json({ data: service.getActive(profileId(c)) }),

    history: (c: Context) => c.json({ data: service.getHistory(profileId(c)) }),

    getById: (c: Context) =>
      c.json({ data: service.getById(challengeId(c), profileId(c)) }),

    generate: async (c: Context) => {
      const input = parseInput(
        generateChallengeRequestSchema,
        await readJson(c.req.raw),
      );
      return c.json(
        { data: await service.generate(input.prompt, profileId(c)) },
        201,
      );
    },

    complete: (c: Context) =>
      c.json({ data: service.complete(challengeId(c), profileId(c)) }),

    hint: (c: Context) =>
      streamNdjson(c, (onDelta) =>
        service.generateHint(challengeId(c), profileId(c), onDelta),
      ),
  };
}

export type ChallengeController = ReturnType<typeof createChallengeController>;
