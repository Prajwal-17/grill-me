import type { Context } from "hono";
import { z } from "zod";
import { modelSelectionSchema } from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { parseInput } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import { challengeParamsSchema } from "./challenge.schema";
import type { ProjectPreparationService } from "./project-preparation.service";

const startProjectPreparationSchema = z.object({
  selection: modelSelectionSchema.optional(),
});

async function optionalJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "The request body must be valid JSON.",
      400,
    );
  }
}

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

export function createProjectPreparationController(
  service: ProjectPreparationService,
) {
  return {
    get: async (c: Context) =>
      c.json({ data: await service.get(profileId(c), challengeId(c)) }),

    start: async (c: Context) => {
      const input = parseInput(
        startProjectPreparationSchema,
        await optionalJson(c.req.raw),
      );
      return c.json(
        {
          data: await service.start(profileId(c), challengeId(c), {
            selection: input.selection,
          }),
        },
        202,
      );
    },

    cancel: async (c: Context) =>
      c.json({ data: await service.cancel(profileId(c), challengeId(c)) }),
  };
}

export type ProjectPreparationController = ReturnType<
  typeof createProjectPreparationController
>;
