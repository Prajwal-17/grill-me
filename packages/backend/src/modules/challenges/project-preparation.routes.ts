import { Hono } from "hono";
import type { ProjectPreparationController } from "./project-preparation.controller";

export function createProjectPreparationRoutes(
  controller: ProjectPreparationController,
) {
  const routes = new Hono();
  routes.get("/:id/project-files", controller.files);
  routes.get("/:id/project-files/file", controller.file);
  routes.get("/:id/project-preparation", controller.get);
  routes.post("/:id/project-preparation/start", controller.start);
  routes.post("/:id/project-preparation/retry", controller.retry);
  routes.post("/:id/project-preparation/resume", controller.resume);
  routes.post("/:id/project-preparation/fresh", controller.fresh);
  routes.post("/:id/project-preparation/cancel", controller.cancel);
  routes.post(
    "/:id/project-preparation/commands/:commandId/approve",
    controller.approveCommand,
  );
  routes.post(
    "/:id/project-preparation/commands/:commandId/reject",
    controller.rejectCommand,
  );
  routes.post(
    "/:id/project-preparation/command-authorization",
    controller.authorizeAttemptCommands,
  );
  return routes;
}
