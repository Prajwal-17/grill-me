import { Hono } from "hono";
import type { ReviewController } from "./review.controller";

export function createReviewRoutes(controller: ReviewController) {
  const routes = new Hono();
  routes.get("/:id/reviews", controller.list);
  routes.post("/:id/review", controller.create);
  return routes;
}
