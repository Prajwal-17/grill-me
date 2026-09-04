import { Hono } from "hono";
import type { ProfileController } from "./profile.controller";

export function createProfileRoutes(controller: ProfileController) {
  const routes = new Hono();
  routes.post("/start", controller.start);
  return routes;
}
