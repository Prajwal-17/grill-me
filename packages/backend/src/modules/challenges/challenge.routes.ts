import { Hono } from "hono";
import type { ChallengeController } from "./challenge.controller";

export function createChallengeRoutes(controller: ChallengeController) {
  const routes = new Hono();
  routes.get("/active", controller.active);
  routes.get("/saved", controller.saved);
  routes.get("/archived", controller.archived);
  routes.get("/history", controller.history);
  routes.post("/enhance-prompt", controller.enhancePrompt);
  routes.post("/prepare", controller.prepare);
  routes.post("/generate", controller.generate);
  routes.get("/:id", controller.getById);
  routes.get("/:id/workspace", controller.workspace);
  routes.post("/:id/workspace/relink", controller.relinkWorkspace);
  routes.post("/:id/hint", controller.hint);
  routes.post("/:id/complete", controller.complete);
  routes.post("/:id/status", controller.status);
  routes.post("/:id/archive", controller.archive);
  routes.post("/:id/restore", controller.restore);
  return routes;
}
