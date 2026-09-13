import { Hono } from "hono";
import type { ChallengeController } from "./challenge.controller";

export function createChallengeRoutes(controller: ChallengeController) {
  const routes = new Hono();
  routes.get("/active", controller.active);
  routes.get("/saved", controller.saved);
  routes.get("/history", controller.history);
  routes.post("/prepare", controller.prepare);
  routes.post("/generate", controller.generate);
  routes.get("/:id", controller.getById);
  routes.post("/:id/hint", controller.hint);
  routes.post("/:id/complete", controller.complete);
  routes.post("/:id/status", controller.status);
  return routes;
}
