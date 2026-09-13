import { recentLearningEvidence } from "../reviews/learning-evidence";
import { DIFFICULTY_BANDS } from "../ai/prompts/difficulty-policies";
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

  function owned(id: string, profileId: string) {
    profiles.assertExists(profileId);
    return requireChallenge(challenges.findOwned(id, profileId));
  }

  function learnerContext(profileId: string) {
    return {
      profileId,
      preferences: profiles.getPreferences(profileId),
      recentEvidence: recentLearningEvidence(profileId),
      recentChallenges: challenges.findRecent(profileId, 10).map((row) => ({
        title: row.title,
        scope: row.scope,
        contextualDifficulty: row.contextualDifficulty,
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
      input: {
        prompt: string;
        scope: BuildScope;
        difficulty: BuildDifficulty;
      },
      profileId: string,
    ) {
      profiles.assertExists(profileId);
      return llm.prepareBuild({
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
      let generated = await llm.generateBuild(modelInput);
      const [min, max] = DIFFICULTY_BANDS[input.difficulty];
      if (
        generated.estimatedDifficultyScore < min ||
        generated.estimatedDifficultyScore > max
      ) {
        generated = await llm.generateBuild({
          ...modelInput,
          calibrationFeedback: `The previous brief was estimated at ${generated.estimatedDifficultyScore}/10. Reduce or increase the actual reasoning demands to fit ${input.difficulty} (${min}–${max}/10) while keeping the selected scope and prerequisites. Do not simply relabel it.`,
        });
      }
      if (
        generated.estimatedDifficultyScore < min ||
        generated.estimatedDifficultyScore > max
      ) {
        throw new AppError(
          "DIFFICULTY_MISMATCH",
          "The generated task did not match your selected difficulty. Try again.",
          502,
          true,
        );
      }
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
        challenges.create(profileId, finalBuild, input.prompt, {
          ...JSON.parse(requestPromptContext(modelInput)),
          promptVersion: PROMPT_VERSION,
          calibrationVersion: CALIBRATION_VERSION,
          requestedModel: process.env.LLM_MODEL ?? "auto",
        }),
      );
    },

    complete(id: string, profileId: string) {
      const challenge = owned(id, profileId);
      if (challenge.status === "completed") return toChallenge(challenge);
      throw new AppError(
        "REVIEW_REQUIRED",
        "Submit your work for review. Accepted submissions complete the challenge automatically.",
        409,
      );
    },
    setStatus(
      id: string,
      profileId: string,
      status: "active" | "paused" | "stopped",
    ) {
      const challenge = owned(id, profileId);
      if (challenge.status === "completed")
        throw new AppError(
          "ALREADY_ACCEPTED",
          "This challenge is complete. Start a new challenge for further practice.",
          409,
        );
      return toChallenge(challenges.setStatus(id, status)!);
    },

    async generateHint(
      id: string,
      profileId: string,
      onDelta: (delta: string) => Promise<void>,
      helpKind: "hint" | "approach" = "hint",
    ) {
      const row = requireActiveChallenge(owned(id, profileId));
      let hint = "";
      for await (const delta of llm.generateHint({
        helpKind,
        challenge: toChallenge(row),
        messages: messages.findRowsByChallenge(row.id).map(toMessage),
        learner: learnerContext(profileId),
      })) {
        hint += delta;
        await onDelta(delta);
      }

      return toChallenge(challenges.saveHint(row.id, hint, helpKind));
    },

    owned,
  };
}

export type ChallengeService = ReturnType<typeof createChallengeService>;
