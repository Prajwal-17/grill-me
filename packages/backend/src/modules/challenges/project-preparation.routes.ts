import { Hono } from "hono";
import type { ProjectPreparationController } from "./project-preparation.controller";

export function createProjectPreparationRoutes(
  controller: ProjectPreparationController,
) {
  const routes = new Hono();
  routes.get("/:id/project-preparation", controller.get);
  routes.post("/:id/project-preparation/start", controller.start);
  routes.post("/:id/project-preparation/cancel", controller.cancel);
  return routes;
}
