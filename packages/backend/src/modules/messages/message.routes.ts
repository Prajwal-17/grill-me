import { Hono } from "hono";
import type { MessageController } from "./message.controller";

export function createMessageRoutes(controller: MessageController) {
  const routes = new Hono();
  routes.get("/:id/messages", controller.list);
  routes.post("/:id/messages", controller.create);
  return routes;
}
