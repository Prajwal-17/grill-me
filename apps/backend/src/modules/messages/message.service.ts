import type { ModelGateway } from "../ai/model-gateway";
import type { ChallengeModel } from "../challenges/challenge.model";
import {
  requireActiveChallenge,
  requireChallenge,
  toChallenge,
} from "../challenges/challenge.utils";
import type { ProfileService } from "../profiles/profile.service";
import type { MessageModel } from "./message.model";
import type { ConversationMode } from "./message.schema";
import { toMessage } from "./message.utils";

export function createMessageService(dependencies: {
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
    list(challengeId: string, profileId: string) {
      const challenge = owned(challengeId, profileId);
      return messages.findRowsByChallenge(challenge.id).map(toMessage);
    },

    async respond(
      input: {
        challengeId: string;
        profileId: string;
        content: string;
        mode: ConversationMode;
      },
      onDelta: (delta: string) => Promise<void>,
    ) {
      const challenge = requireActiveChallenge(
        owned(input.challengeId, input.profileId),
      );
      const transcript = messages
        .findRowsByChallenge(challenge.id)
        .map(toMessage);

      let reply = "";
      for await (const delta of llm.respond({
        challenge: toChallenge(challenge),
        messages: transcript,
        content: input.content,
        mode: input.mode,
      })) {
        reply += delta;
        await onDelta(delta);
      }

      return toMessage(
        messages.saveExchange({
          challengeId: challenge.id,
          content: input.content,
          mode: input.mode,
          reply,
        }),
      );
    },
  };
}

export type MessageService = ReturnType<typeof createMessageService>;
