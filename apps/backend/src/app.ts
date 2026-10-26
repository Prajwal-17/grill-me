import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ModelGateway } from "./modules/ai/model-gateway";
import { createChallengeController } from "./modules/challenges/challenge.controller";
import { challengeModel } from "./modules/challenges/challenge.model";
import { createChallengeRoutes } from "./modules/challenges/challenge.routes";
import { createChallengeService } from "./modules/challenges/challenge.service";
import { createLogRoutes } from "./modules/logs/log.routes";
import { createMessageController } from "./modules/messages/message.controller";
import { messageModel } from "./modules/messages/message.model";
import { createMessageRoutes } from "./modules/messages/message.routes";
import { createMessageService } from "./modules/messages/message.service";
import { createProfileController } from "./modules/profiles/profile.controller";
import {
  profileModel,
  profilePreferencesModel,
} from "./modules/profiles/profile.model";
import { createProfileRoutes } from "./modules/profiles/profile.routes";
import { createProfileService } from "./modules/profiles/profile.service";
import { createReviewRoutes } from "./modules/reviews/review.routes";
import { createReviewService } from "./modules/reviews/review.service";
import { createQuizRoutes } from "./modules/quizzes/quiz.routes";
import { createQuizService } from "./modules/quizzes/quiz.service";
import { handleError } from "./shared/http/error-handler";

type AppDependencies = {
  llm: ModelGateway;
  webOrigin?: string;
};

export function createApp({
  llm,
  webOrigin = "http://localhost:17018,http://127.0.0.1:17018",
}: AppDependencies) {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: webOrigin
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      allowHeaders: ["Content-Type", "X-Profile-Id"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );

  const profileService = createProfileService(
    profileModel,
    profilePreferencesModel,
  );

  const reviewService = createReviewService(llm);
  const challengeService = createChallengeService({
    challenges: challengeModel,
    messages: messageModel,
    profiles: profileService,
    llm,
  });
  const messageService = createMessageService({
    challenges: challengeModel,
    messages: messageModel,
    profiles: profileService,
    llm,
  });

  app.route("/", createReviewRoutes(reviewService, profileService));
  app.get("/health", (c) => c.json({ data: { status: "ok" } }));
  app.route("/logs", createLogRoutes(profileService));
  app.route(
    "/profiles",
    createProfileRoutes(createProfileController(profileService, llm)),
  );
  app.route(
    "/challenges",
    createChallengeRoutes(createChallengeController(challengeService)),
  );
  app.route(
    "/challenges",
    createMessageRoutes(createMessageController(messageService)),
  );
  const quizService = createQuizService(llm, challengeService, profileService);
  app.route("/challenges", createQuizRoutes(quizService));
  app.route("/quizzes", createQuizRoutes(quizService, true));
  app.onError(handleError);

  return app;
}
