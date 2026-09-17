import { Hono, type Context } from "hono";
import { AppError } from "../../shared/errors/app-error";
import { parseInput } from "../../shared/http/validation";
import { profileIdSchema } from "../profiles/profile.schema";
import type { ProfileService } from "../profiles/profile.service";
import { logModel } from "./log.model";
import { logIdSchema, logQuerySchema } from "./log.schema";

export function createLogRoutes(profiles: ProfileService) {
  const routes = new Hono();
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  async function profileId(c: Context) {
    const header = c.req.header("X-Profile-Id");
    if (!header)
      throw new AppError(
        "PROFILE_REQUIRED",
        "Enter your email to view logs.",
        401,
      );
    const id = parseInput(profileIdSchema, header);
    await profiles.assertExists(id);
    return id;
  }
  routes.get("/", async (c) =>
    c.json({
      data: await logModel.list(
        await profileId(c),
        parseInput(logQuerySchema, c.req.query()),
      ),
    }),
  );
  routes.get("/:id", async (c) => {
    const owner = await profileId(c);
    const row = await logModel.findOwned(
      parseInput(logIdSchema, c.req.param("id")),
      owner,
    );
    if (!row) throw new AppError("LOG_NOT_FOUND", "Log not found.", 404);
    return c.json({ data: row });
  });
  return routes;
}
