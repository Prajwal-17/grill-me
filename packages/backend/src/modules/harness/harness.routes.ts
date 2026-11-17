import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  harnessRequestDecisionSchema,
  harnessThreadCreateSchema,
  harnessTurnCreateSchema,
} from "../../shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { parseInput, readJson } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import type { ProfileService } from "../profiles/profile.service";
import { harnessService } from "./harness.service";
import { removedHelpFeature } from "../messages/removed-help";

function assertAvailable(kind: string) {
  if (["chat", "hint", "clarify", "discussion"].includes(kind))
    removedHelpFeature();
}

function profile(c: Context) {
  const header = c.req.header("X-Profile-Id");
  if (!header)
    throw new AppError(
      "PROFILE_REQUIRED",
      "Enter your email to view runs.",
      401,
    );
  return parseInput(profileIdSchema, header);
}

const threadId = (c: Context) =>
  parseInput(z.string().uuid(), c.req.param("id"));

export function createHarnessRoutes(profiles: ProfileService) {
  const routes = new Hono();
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  routes.get("/", async (c) => {
    const id = profile(c);
    await profiles.assertExists(id);
    const query = parseInput(
      z.object({
        kind: z.string().trim().min(1).max(64).optional(),
        challengeId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(1_000).default(50),
      }),
      c.req.query(),
    );
    return c.json({ data: await harnessService.list(id, query) });
  });
  routes.post("/", async (c) => {
    const id = profile(c);
    await profiles.assertExists(id);
    const input = parseInput(
      harnessThreadCreateSchema,
      await readJson(c.req.raw),
    );
    assertAvailable(input.kind);
    const thread = await harnessService.createThread({
      profileId: id,
      ...input,
    });
    const turn = await harnessService.appendTurn(thread.id, {
      inputText: input.title,
    });
    return c.json({ data: { thread, turn } }, 201);
  });
  routes.get("/:id", async (c) => {
    const id = profile(c);
    await profiles.assertExists(id);
    return c.json({ data: await harnessService.detail(threadId(c), id) });
  });
  routes.post("/:id/turns", async (c) => {
    const id = profile(c);
    await profiles.assertExists(id);
    const thread = await harnessService.detail(threadId(c), id);
    assertAvailable(thread.thread.kind);
    const input = parseInput(
      harnessTurnCreateSchema,
      await readJson(c.req.raw),
    );
    const turn = await harnessService.appendTurn(thread.thread.id, input);
    return c.json({ data: turn }, 201);
  });
  routes.post("/:id/stop", async (c) => {
    const id = profile(c);
    await profiles.assertExists(id);
    const runId = threadId(c);
    const stopped = await harnessService.stop(runId, id);
    return c.json({ data: stopped });
  });
  routes.post("/:id/retry", async (c) => {
    const id = profile(c);
    await profiles.assertExists(id);
    const runId = threadId(c);
    const detail = await harnessService.detail(runId, id);
    assertAvailable(detail.thread.kind);
    const turn = await harnessService.retry(runId, id);
    return c.json({ data: turn }, 202);
  });
  routes.post("/:id/requests/:requestId", async (c) => {
    const id = profile(c);
    await profiles.assertExists(id);
    const requestId = parseInput(z.string().uuid(), c.req.param("requestId"));
    const input = parseInput(
      harnessRequestDecisionSchema,
      await readJson(c.req.raw),
    );
    return c.json({
      data: await harnessService.resolveRequest(
        threadId(c),
        id,
        requestId,
        input,
      ),
    });
  });
  return routes;
}
