import { z } from "zod";
import type { Context } from "hono";
import { AppError } from "../../shared/errors/app-error";
import { streamNdjson } from "../../shared/http/ndjson-stream";
import { parseInput, readJson } from "../../shared/http/validation";
import { challengeParamsSchema } from "../challenges/challenge.schema";
import { profileIdSchema } from "../profiles/profile.schema";
import type { MessageService } from "./message.service";
import {
  createMessageRequestSchema,
  retryMessageRequestSchema,
} from "./message.schema";

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

    retry: async (c: Context) => {
      await service.assertAccess(challengeId(c), profileId(c));
      const input = parseInput(
        retryMessageRequestSchema,
        await readJson(c.req.raw),
      );
      return streamNdjson(c, (onDelta, signal) =>
        service.retry(
          challengeId(c),
          profileId(c),
          parseInput(z.string().uuid(), c.req.param("messageId")),
          onDelta,
          signal,
          input.selection,
        ),
      );
    },
    create: async (c: Context) => {
      await service.assertAccess(challengeId(c), profileId(c));
      const input = parseInput(
        createMessageRequestSchema,
        await readJson(c.req.raw),
      );

      return streamNdjson(c, (onDelta, signal) =>
        service.respond(
          {
            challengeId: challengeId(c),
            profileId: profileId(c),
            ...input,
            signal,
          },
          onDelta,
        ),
      );
    },
  };
}

export type MessageController = ReturnType<typeof createMessageController>;
