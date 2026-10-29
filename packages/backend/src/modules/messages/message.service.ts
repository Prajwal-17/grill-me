import { recentLearningEvidence } from "../reviews/learning-evidence";
import type { ModelGateway } from "../ai/model-gateway";
import type { ChallengeModel } from "../challenges/challenge.model";
import {
  requireActiveChallenge,
  requireChallenge,
  toChallenge,
} from "../challenges/challenge.utils";
import type { ProfileService } from "../profiles/profile.service";
import type { MessageModel } from "./message.model";
import type { ConversationMode, MessageAttachment } from "./message.schema";
import { toMessage } from "./message.utils";

export function createMessageService(dependencies: {
  challenges: ChallengeModel;
  messages: MessageModel;
  profiles: ProfileService;
  llm: ModelGateway;
}) {
  const { challenges, messages, profiles, llm } = dependencies;

  async function owned(id: string, profileId: string) {
    await profiles.assertExists(profileId);
    return requireChallenge(await challenges.findOwned(id, profileId));
  }

  async function learnerContext(profileId: string) {
    const preferences = await profiles.getPreferences(profileId);
    return {
      profileId,
      preferences,
      recentEvidence: preferences.includeRecentChallenges
        ? await recentLearningEvidence(profileId)
        : [],
      recentChallenges: (preferences.includeRecentChallenges
        ? await challenges.findRecent(profileId, 10)
        : []
      ).map((row) => ({
        title: row.title,
        scope: row.scope,
        contextualDifficulty: row.contextualDifficulty,
        summary: row.problemStatement.slice(0, 500),
      })),
    };
  }

  return {
    async list(challengeId: string, profileId: string) {
      const challenge = await owned(challengeId, profileId);
      return (await messages.findRowsByChallenge(challenge.id)).map(toMessage);
    },

    async respond(
      input: {
        challengeId: string;
        profileId: string;
        content: string;
        mode: ConversationMode;
        attachments: MessageAttachment[];
      },
      onDelta: (delta: string) => Promise<void>,
    ) {
      const challenge = requireActiveChallenge(
        await owned(input.challengeId, input.profileId),
      );
      const transcript = (await messages.findRowsByChallenge(challenge.id)).map(
        toMessage,
      );

      let reply = "";
      for await (const delta of llm.respond({
        challenge: toChallenge(challenge),
        messages: transcript,
        content: input.content,
        mode: input.mode,
        attachments: input.attachments,
        learner: await learnerContext(input.profileId),
      })) {
        reply += delta;
        await onDelta(delta);
      }

      return toMessage(
        await messages.saveExchange({
          challengeId: challenge.id,
          content: input.content,
          mode: input.mode,
          attachments: input.attachments,
          reply,
        }),
      );
    },
  };
}

export type MessageService = ReturnType<typeof createMessageService>;
