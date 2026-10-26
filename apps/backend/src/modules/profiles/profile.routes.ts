import { Hono } from "hono";
import type { ProfileController } from "./profile.controller";

export function createProfileRoutes(controller: ProfileController) {
  const routes = new Hono();
  routes.post("/start", controller.start);
  routes.post("/resume/preview", controller.resumePreview);
  routes.get("/preferences", controller.preferences);
  routes.post("/preferences", controller.savePreferences);
  return routes;
}
