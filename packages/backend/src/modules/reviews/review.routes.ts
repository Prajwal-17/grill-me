import { verificationAvailable } from "../verification/runner";
import { browseFolders } from "../projects/browse";
import { beginUpload, appendUpload } from "../projects/uploads";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { createReviewService } from "./review.service";
import { submissionRequestSchema } from "./review.service";
import { parseInput, readJson } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import type { ProfileService } from "../profiles/profile.service";
import { codexStatus, codexModels } from "../judges/codex";
import { omnirouteStatus } from "../ai/openai.model";
import { AppError } from "../../shared/errors/app-error";
export function createReviewRoutes(
  service: ReturnType<typeof createReviewService>,
  profiles: ProfileService,
  providerStatus = omnirouteStatus,
) {
  const routes = new Hono();
  const profile = async (c: Context) => {
    const id = c.req.header("X-Profile-Id");
    if (!id)
      throw new AppError("PROFILE_REQUIRED", "Choose your local profile.", 401);
    return profiles.assertExists(parseInput(profileIdSchema, id));
  };
  const id = (c: Context) => parseInput(z.string().uuid(), c.req.param("id"));
  routes.post("/uploads", async (c) => {
    const owner = await profile(c);
    const { filename } = parseInput(
      z.object({ filename: z.string().min(1) }),
      await readJson(c.req.raw),
    );
    return c.json({ data: await beginUpload(owner, filename) }, 201);
  });
  routes.post("/uploads/:id/chunks", async (c) => {
    const owner = await profile(c);
    const input = parseInput(
      z.object({
        offset: z.number().int().nonnegative(),
        data: z.string().max(524288),
        finish: z.boolean(),
      }),
      await readJson(c.req.raw),
    );
    return c.json({
      data: await appendUpload(
        owner,
        id(c),
        input.offset,
        input.data,
        input.finish,
      ),
    });
  });
  routes.get("/projects/browse", async (c) => {
    await profile(c);
    return c.json({ data: await browseFolders(c.req.query("path")) });
  });
  routes.get("/projects", async (c) =>
    c.json({ data: await service.listProjects(await profile(c)) }),
  );
  routes.post("/projects", async (c) => {
    const owner = await profile(c);
    const input = parseInput(
      z.object({ path: z.string().min(1) }),
      await readJson(c.req.raw),
    );
    return c.json({ data: await service.connect(owner, input.path) }, 201);
  });
  routes.get("/judges/models", async (c) => {
    await profile(c);
    return c.json({ data: await codexModels() });
  });
  routes.get("/judges/status", async (c) => {
    await profile(c);
    const omniroute = await providerStatus();
    return c.json({
      data: {
        codex: await codexStatus(),
        verificationAvailable: verificationAvailable(),
        omniroute,
        omnirouteConfigured: omniroute.configured,
      },
    });
  });
  routes.get("/progress", async (c) =>
    c.json({ data: await service.progress(await profile(c)) }),
  );
  routes.get("/challenges/:id/submissions", async (c) =>
    c.json({ data: await service.list(id(c), await profile(c)) }),
  );
  routes.get("/submissions/:id/files", async (c) =>
    c.json({
      data: await service.file(
        id(c),
        await profile(c),
        parseInput(z.string().min(1), c.req.query("path")),
      ),
    }),
  );
  routes.post("/challenges/:id/submissions", async (c) => {
    const owner = await profile(c);
    const input = parseInput(
      submissionRequestSchema,
      await readJson(c.req.raw),
    );
    return c.json({ data: await service.submit(id(c), owner, input) }, 202);
  });
  routes.get("/reviews/:id", async (c) =>
    c.json({ data: await service.get(id(c), await profile(c)) }),
  );
  routes.post("/reviews/:id/retry", async (c) => {
    const owner = await profile(c);
    const { followup } = parseInput(
      z.object({ followup: z.string().nullable().default(null) }),
      await readJson(c.req.raw),
    );
    return c.json({ data: await service.retry(id(c), owner, followup) }, 202);
  });
  routes.post("/reviews/:id/cancel", async (c) =>
    c.json({ data: await service.cancel(id(c), await profile(c)) }),
  );
  return routes;
}
