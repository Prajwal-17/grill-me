import { Hono, type Context } from "hono";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { parseInput, readJson } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import {
  generationAnswerSchema,
  generationRequestSchema,
  generationRetrySchema,
} from "./generation.schema";
import type { GenerationService } from "./generation.service";

function profile(c: Context) {
  const id = c.req.header("X-Profile-Id");
  if (!id)
    throw new AppError(
      "PROFILE_REQUIRED",
      "Choose a profile to generate practice.",
      401,
    );
  return parseInput(profileIdSchema, id);
}
const id = (c: Context) => parseInput(z.string().uuid(), c.req.param("id"));
export function createGenerationRoutes(service: GenerationService) {
  const routes = new Hono();
  routes.get("/", async (c) =>
    c.json({ data: await service.list(profile(c)) }),
  );
  routes.post("/", async (c) => {
    const request = parseInput(
      generationRequestSchema,
      await readJson(c.req.raw),
    );
    return c.json({ data: await service.enqueue(profile(c), request) }, 202);
  });
  routes.get("/:id", async (c) =>
    c.json({ data: await service.detail(id(c), profile(c)) }),
  );
  routes.post("/:id/acknowledge", async (c) => {
    const input = parseInput(
      z.object({
        status: z.enum([
          "queued",
          "running",
          "needs_input",
          "completed",
          "failed",
          "cancelled",
        ]),
        updatedAt: z.iso.datetime().transform((value) => new Date(value)),
      }),
      await readJson(c.req.raw),
    );
    return c.json({
      data: await service.acknowledge(
        id(c),
        profile(c),
        input.status,
        input.updatedAt,
      ),
    });
  });
  routes.post("/:id/answer", async (c) => {
    const input = parseInput(generationAnswerSchema, await readJson(c.req.raw));
    return c.json(
      {
        data: await service.answer(
          id(c),
          profile(c),
          input.question,
          input.answer,
        ),
      },
      202,
    );
  });
  routes.post("/:id/retry", async (c) => {
    const input = parseInput(generationRetrySchema, await readJson(c.req.raw));
    return c.json(
      { data: await service.retry(id(c), profile(c), input.skipPreparation) },
      202,
    );
  });
  routes.post("/:id/cancel", async (c) =>
    c.json({ data: await service.cancel(id(c), profile(c)) }),
  );
  return routes;
}
