import type { ModelSelection } from "@repo/backend/shared/contracts";
import type { ModelGateway } from "../ai/model-gateway";
import type { ChallengeModel } from "../challenges/challenge.model";
import {
  requireActiveChallenge,
  requireChallenge,
  toChallenge,
} from "../challenges/challenge.utils";
import { harnessService } from "../harness/harness.service";
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
    // A discussion uses only its own transcript. Stored history remains
    // available to the existing history screens but never enriches a run.
    return {
      profileId,
      preferences,
      recentEvidence: [],
      recentChallenges: [],
    };
  }

  async function chatThread(profileId: string, challengeId: string) {
    const existing = await messages.chatThread(profileId, challengeId);
    if (existing)
      return {
        id: existing.id,
        model: existing.model,
      };
    const challenge = await owned(challengeId, profileId);
    const created = await harnessService.createThread({
      profileId,
      kind: "chat",
      title: challenge.title,
      challengeId,
      transport: "api",
      model: process.env.LLM_MODEL ?? "auto",
    });
    return { id: created.id, model: created.model };
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
        selection?: ModelSelection;
        signal?: AbortSignal;
      },
      onDelta: (delta: string) => Promise<void>,
    ) {
      const challenge = requireActiveChallenge(
        await owned(input.challengeId, input.profileId),
      );
      const transcript = (await messages.findRowsByChallenge(challenge.id)).map(
        toMessage,
      );
      const thread = await chatThread(input.profileId, challenge.id);
      const turn = await harnessService.appendTurn(thread.id, {
        inputText: input.content,
      });
      for await (const delta of llm.respond({
        signal: input.signal,
        challenge: toChallenge(challenge),
        messages: transcript.filter(
          (m) =>
            m.status === "completed" &&
            m.mode !== "hint" &&
            m.mode !== "review",
        ),
        content: input.content,
        mode: "clarify",
        attachments: input.attachments,
        selection: input.selection,
        learner: await learnerContext(input.profileId),
        harness: {
          threadId: thread.id,
          turnId: turn.id,
          inputText: input.content,
        },
      })) {
        input.signal?.throwIfAborted();
        await onDelta(delta);
      }
      input.signal?.throwIfAborted();
      const detail = await harnessService.detail(thread.id, input.profileId);
      const recordedTurn = detail.turns.find((entry) => entry.id === turn.id);
      const assistant = recordedTurn?.items.find(
        (item) => item.type === "assistant_message",
      );
      const rows = await messages.findRowsByChallenge(challenge.id);
      const saved = assistant
        ? rows.find((row) => row.id === assistant.id)
        : rows
            .filter(
              (row) =>
                row.role === "assistant" &&
                row.createdAt.getTime() >= new Date(turn.requestedAt).getTime(),
            )
            .at(-1);
      if (saved) return toMessage(saved);
      throw new AppError(
        "EMPTY_MODEL_RESPONSE",
        "The provider returned an empty response. Try again.",
        502,
        true,
      );
    },
    async retry(
      challengeId: string,
      profileId: string,
      id: string,
      onDelta: (delta: string) => Promise<void>,
      signal?: AbortSignal,
      selection?: ModelSelection,
    ) {
      await owned(challengeId, profileId);
      const original = await messages.retryInput(challengeId, id);
      return this.respond(
        {
          challengeId,
          profileId,
          content: original.content,
          mode: "clarify",
          attachments: original.attachments,
          signal,
          selection,
        },
        onDelta,
      );
    },
  };
}

export type MessageService = ReturnType<typeof createMessageService>;
