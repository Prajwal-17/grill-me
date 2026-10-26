import { z } from "zod";
import type { Context } from "hono";
import { AppError } from "../../shared/errors/app-error";
import { streamNdjson } from "../../shared/http/ndjson-stream";
import { parseInput, readJson } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import type { ChallengeService } from "./challenge.service";
import {
  challengeParamsSchema,
  generateChallengeRequestSchema,
  prepareChallengeRequestSchema,
  enhanceBuildPromptSchema,
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
    enhancePrompt: async (c: Context) => {
      const input = parseInput(
        enhanceBuildPromptSchema,
        await readJson(c.req.raw),
      );
      return c.json({
        data: await service.enhancePrompt(profileId(c), input.prompt),
      });
    },
    active: async (c: Context) =>
      c.json({ data: await service.getActive(profileId(c)) }),

    saved: async (c: Context) =>
      c.json({ data: await service.getSaved(profileId(c)) }),

    archived: async (c: Context) =>
      c.json({ data: await service.getArchived(profileId(c)) }),

    archive: async (c: Context) =>
      c.json({
        data: await service.setArchived(challengeId(c), profileId(c), true),
      }),

    restore: async (c: Context) =>
      c.json({
        data: await service.setArchived(challengeId(c), profileId(c), false),
      }),

    history: async (c: Context) =>
      c.json({ data: await service.getHistory(profileId(c)) }),

    getById: async (c: Context) =>
      c.json({ data: await service.getById(challengeId(c), profileId(c)) }),

    prepare: async (c: Context) => {
      const input = parseInput(
        prepareChallengeRequestSchema,
        await readJson(c.req.raw),
      );
      return c.json({ data: await service.prepare(input, profileId(c)) });
    },

    generate: async (c: Context) => {
      const input = parseInput(
        generateChallengeRequestSchema,
        await readJson(c.req.raw),
      );
      return c.json({ data: await service.generate(input, profileId(c)) }, 201);
    },

    complete: async (c: Context) =>
      c.json({ data: await service.complete(challengeId(c), profileId(c)) }),

    status: async (c: Context) => {
      const { status } = parseInput(
        z.object({ status: z.enum(["active", "paused", "saved", "stopped"]) }),
        await readJson(c.req.raw),
      );
      return c.json({
        data: await service.setStatus(challengeId(c), profileId(c), status),
      });
    },
    hint: (c: Context) =>
      streamNdjson(c, (onDelta) =>
        service.generateHint(
          challengeId(c),
          profileId(c),
          onDelta,
          c.req.query("kind") === "approach" ? "approach" : "hint",
        ),
      ),
  };
}

export type ChallengeController = ReturnType<typeof createChallengeController>;
