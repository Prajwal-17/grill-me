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
import { AppError } from "../../shared/errors/app-error";

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
    assertAccess: owned,
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
        signal?: AbortSignal;
        userId?: string;
      },
      onDelta: (delta: string) => Promise<void>,
    ) {
      const challenge = requireActiveChallenge(
        await owned(input.challengeId, input.profileId),
      );
      const transcript = (await messages.findRowsByChallenge(challenge.id)).map(
        toMessage,
      );

      const incompleteUsers = new Set(
        transcript
          .filter((m) => m.role === "assistant" && m.status !== "completed")
          .map((m) => m.replyTo),
      );
      const completedUsers = new Set(
        transcript
          .filter((m) => m.role === "assistant" && m.status === "completed")
          .map((m) => m.replyTo),
      );
      const durable = messages.durable();
      const turn = durable ? await messages.beginExchange(input) : null;
      let reply = "";
      let savedAt = Date.now();
      try {
        for await (const delta of llm.respond({
          signal: input.signal,
          challenge: toChallenge(challenge),
          messages: transcript.filter(
            (m) =>
              m.status === "completed" &&
              m.id !== input.userId &&
              !(
                m.role === "user" &&
                incompleteUsers.has(m.id) &&
                !completedUsers.has(m.id)
              ),
          ),
          content: input.content,
          mode: input.mode,
          attachments: input.attachments,
          learner: await learnerContext(input.profileId),
        })) {
          input.signal?.throwIfAborted();
          reply += delta;
          if (turn && Date.now() - savedAt >= 250) {
            await messages.checkpoint(turn.assistantId, reply);
            savedAt = Date.now();
          }
          await onDelta(delta);
        }
        input.signal?.throwIfAborted();
        if (turn) {
          await messages.checkpoint(turn.assistantId, reply, "completed");
          return toMessage(
            (await messages.findRowsByChallenge(challenge.id)).find(
              (m) => m.id === turn.assistantId,
            )!,
          );
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
      } catch (error) {
        if (turn)
          await messages.checkpoint(
            turn.assistantId,
            reply,
            input.signal?.aborted ||
              (error instanceof AppError && error.code === "REQUEST_CANCELLED")
              ? "cancelled"
              : "failed",
            error instanceof AppError
              ? error.message
              : "The provider could not finish this response. Check Settings and retry.",
          );
        throw error;
      }
    },
    async retry(
      challengeId: string,
      profileId: string,
      id: string,
      onDelta: (delta: string) => Promise<void>,
      signal?: AbortSignal,
    ) {
      await owned(challengeId, profileId);
      if (!messages.durable())
        throw new AppError(
          "MESSAGE_NOT_RETRYABLE",
          "Saved response retries are available in local mode.",
          409,
        );
      const original = await messages.retryInput(challengeId, id);
      return this.respond(
        {
          challengeId,
          profileId,
          content: original.content,
          mode: original.mode,
          attachments: original.attachments,
          userId: original.id,
          signal,
        },
        onDelta,
      );
    },
  };
}

export type MessageService = ReturnType<typeof createMessageService>;
