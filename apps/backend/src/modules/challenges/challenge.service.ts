import { recentLearningEvidence } from "../reviews/learning-evidence";
import {
  requestPromptContext,
  PROMPT_VERSION,
  CALIBRATION_VERSION,
} from "../ai/prompts/core";
import { AppError } from "../../shared/errors/app-error";
import type { ModelGateway } from "../ai/model-gateway";
import type { MessageModel } from "../messages/message.model";
import { toMessage } from "../messages/message.utils";
import type { ProfileService } from "../profiles/profile.service";
import type { ChallengeModel } from "./challenge.model";
import {
  challengeContentSchema,
  generatedBuildSchemaForScope,
  type BuildDifficulty,
  type BuildScope,
  type GenerateChallengeInput,
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
    async getActive(profileId: string) {
      await profiles.assertExists(profileId);
      return (await challenges.findActive(profileId)).map(toChallenge);
    },

    async getSaved(profileId: string) {
      await profiles.assertExists(profileId);
      return (await challenges.findSaved(profileId)).map(toChallenge);
    },

    async getHistory(profileId: string) {
      await profiles.assertExists(profileId);
      return (await challenges.findHistory(profileId)).map(toChallenge);
    },

    async getById(id: string, profileId: string) {
      return toChallenge(await owned(id, profileId));
    },

    async prepare(
      input: {
        prompt: string;
        scope: BuildScope;
        difficulty: BuildDifficulty;
      },
      profileId: string,
    ) {
      await profiles.assertExists(profileId);
      return llm.prepareBuild({
        ...input,
        learner: await learnerContext(profileId),
      });
    },

    async generate(input: GenerateChallengeInput, profileId: string) {
      await profiles.assertExists(profileId);
      const modelInput = {
        ...input,
        learner: await learnerContext(profileId),
      };
      const generated = await llm.generateBuild(modelInput);
      const validated = generatedBuildSchemaForScope(input.scope).safeParse(
        generated,
      );
      if (!validated.success) {
        throw new AppError(
          "MODEL_OUTPUT_INVALID",
          "The model did not return a valid build. Try again.",
          502,
          true,
        );
      }
      const finalBuild = challengeContentSchema.parse({
        ...validated.data,
        scope: input.scope,
        difficulty: input.difficulty,
        contextualDifficulty: input.difficulty,
      });
      return toChallenge(
        await challenges.create(profileId, finalBuild, input.prompt, {
          ...JSON.parse(requestPromptContext(modelInput)),
          promptVersion: PROMPT_VERSION,
          calibrationVersion: CALIBRATION_VERSION,
          requestedModel: process.env.LLM_MODEL ?? "auto",
        }),
      );
    },

    async complete(id: string, profileId: string) {
      const challenge = await owned(id, profileId);
      if (challenge.status === "completed") return toChallenge(challenge);
      return toChallenge((await challenges.complete(id))!);
    },
    async setStatus(
      id: string,
      profileId: string,
      status: "active" | "paused" | "saved" | "stopped",
    ) {
      await owned(id, profileId);
      return toChallenge((await challenges.setStatus(id, status))!);
    },

    async generateHint(
      id: string,
      profileId: string,
      onDelta: (delta: string) => Promise<void>,
      helpKind: "hint" | "approach" = "hint",
    ) {
      const row = requireActiveChallenge(await owned(id, profileId));
      let hint = "";
      for await (const delta of llm.generateHint({
        helpKind,
        challenge: toChallenge(row),
        messages: (await messages.findRowsByChallenge(row.id)).map(toMessage),
        learner: await learnerContext(profileId),
      })) {
        hint += delta;
        await onDelta(delta);
      }

      return toChallenge(await challenges.saveHint(row.id, hint, helpKind));
    },

    owned,
  };
}

export type ChallengeService = ReturnType<typeof createChallengeService>;
