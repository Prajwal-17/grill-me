import { AppError } from "../../shared/errors/app-error";
import type { ModelGateway } from "../ai/model-gateway";
import type { MessageModel } from "../messages/message.model";
import { toMessage } from "../messages/message.utils";
import type { ProfileService } from "../profiles/profile.service";
import type { ChallengeModel } from "./challenge.model";
import { challengeContentSchema } from "./challenge.schema";
import type {
  ChallengeFormat,
  GenerateChallengeInput,
} from "./challenge.schema";
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

  function learnerContext(profileId: string) {
    return {
      preferences: profiles.getPreferences(profileId),
      recentChallenges: challenges.findRecent(profileId, 10).map((row) => ({
        title: row.title,
        type: row.type,
        summary: row.problemStatement.slice(0, 500),
      })),
    };
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

    async prepare(
      input: { prompt: string; format: ChallengeFormat },
      profileId: string,
    ) {
      profiles.assertExists(profileId);
      return llm.prepareChallenge({
        ...input,
        learner: learnerContext(profileId),
      });
    },

    async generate(input: GenerateChallengeInput, profileId: string) {
      profiles.assertExists(profileId);
      const modelInput = {
        ...input,
        learner: learnerContext(profileId),
      };
      const draft = await llm.generateChallenge(modelInput);
      const revised = await llm.critiqueChallenge({ ...modelInput, draft });
      const finalChallenge = challengeContentSchema.safeParse(revised);
      if (
        !finalChallenge.success ||
        (input.format !== "auto" && finalChallenge.data.type !== input.format)
      ) {
        throw new AppError(
          "MODEL_OUTPUT_INVALID",
          "The model did not return a valid challenge. Try again.",
          502,
          true,
        );
      }
      return toChallenge(
        challenges.create(profileId, finalChallenge.data, input.prompt),
      );
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
        learner: learnerContext(profileId),
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
