import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ModelGateway } from "./modules/ai/model-gateway";
import { createChallengeController } from "./modules/challenges/challenge.controller";
import { challengeModel } from "./modules/challenges/challenge.model";
import { createChallengeRoutes } from "./modules/challenges/challenge.routes";
import { createChallengeService } from "./modules/challenges/challenge.service";
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
import { handleError } from "./shared/http/error-handler";

type AppDependencies = {
  llm: ModelGateway;
  webOrigin?: string;
};

export function createApp({
  llm,
  webOrigin = "http://localhost:3000",
}: AppDependencies) {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: webOrigin,
      allowHeaders: ["Content-Type", "X-Profile-Id"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    }),
  );

  const profileService = createProfileService(
    profileModel,
    profilePreferencesModel,
  );

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

  app.get("/health", (c) => c.json({ data: { status: "ok" } }));
  app.route(
    "/profiles",
    createProfileRoutes(createProfileController(profileService)),
  );
  app.route(
    "/challenges",
    createChallengeRoutes(createChallengeController(challengeService)),
  );
  app.route(
    "/challenges",
    createMessageRoutes(createMessageController(messageService)),
  );
  app.onError(handleError);

  return app;
}
