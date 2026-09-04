import { AppError } from "../../shared/errors/app-error";
import type { ModelGateway } from "../ai/model-gateway";
import type { MessageModel } from "../messages/message.model";
import { toMessage } from "../messages/message.utils";
import type { ProfileService } from "../profiles/profile.service";
import type { ChallengeModel } from "./challenge.model";
import {
  requireActiveChallenge,
  requireChallenge,
  toChallenge,
} from "./challenge.utils";

export function createChallengeService(dependencies: {
  challenges: ChallengeModel;
  messages: MessageModel;
  profiles: ProfileService;
  llm: ModelGateway;
}) {
  const { challenges, messages, profiles, llm } = dependencies;

  function owned(id: string, profileId: string) {
    profiles.assertExists(profileId);
    return requireChallenge(challenges.findOwned(id, profileId));
  }

  return {
    getActive(profileId: string) {
      profiles.assertExists(profileId);
      return challenges.findActive(profileId).map(toChallenge);
    },

    getHistory(profileId: string) {
      profiles.assertExists(profileId);
      return challenges.findHistory(profileId).map(toChallenge);
    },

    getById(id: string, profileId: string) {
      return toChallenge(owned(id, profileId));
    },

    async generate(prompt: string, profileId: string) {
      profiles.assertExists(profileId);
      const generated = await llm.generateChallenge(prompt);
      return toChallenge(challenges.create(profileId, generated, prompt));
    },

    complete(id: string, profileId: string) {
      const challenge = owned(id, profileId);
      return toChallenge(
        challenge.status === "completed"
          ? challenge
          : challenges.complete(challenge.id),
      );
    },

    async generateHint(
      id: string,
      profileId: string,
      onDelta: (delta: string) => Promise<void>,
    ) {
      const row = requireActiveChallenge(owned(id, profileId));
      if (row.hint) {
        throw new AppError(
          "HINT_ALREADY_USED",
          "You already used the hint for this challenge.",
          409,
        );
      }

      let hint = "";
      for await (const delta of llm.generateHint({
        challenge: toChallenge(row),
        messages: messages.findRowsByChallenge(row.id).map(toMessage),
      })) {
        hint += delta;
        await onDelta(delta);
      }

      return toChallenge(challenges.saveHint(row.id, hint));
    },

    owned,
  };
}

export type ChallengeService = ReturnType<typeof createChallengeService>;
