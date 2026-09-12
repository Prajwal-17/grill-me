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
  function profileId(c: Context) {
    const header = c.req.header("X-Profile-Id");
    if (!header)
      throw new AppError(
        "PROFILE_REQUIRED",
        "Enter your email to view logs.",
        401,
      );
    const id = parseInput(profileIdSchema, header);
    profiles.assertExists(id);
    return id;
  }
  routes.get("/", (c) =>
    c.json({
      data: logModel.list(
        profileId(c),
        parseInput(logQuerySchema, c.req.query()),
      ),
    }),
  );
  routes.get("/:id", (c) => {
    const owner = profileId(c);
    const row = logModel.findOwned(
      parseInput(logIdSchema, c.req.param("id")),
      owner,
    );
    if (!row) throw new AppError("LOG_NOT_FOUND", "Log not found.", 404);
    return c.json({ data: row });
  });
  return routes;
}
