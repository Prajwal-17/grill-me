import { briefIssues } from "./challenge-quality";
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
    const preferences = profiles.getPreferences(profileId);
    return {
      profileId,
      preferences,
      recentEvidence: preferences.includeRecentChallenges
        ? recentLearningEvidence(profileId)
        : [],
      recentChallenges: (preferences.includeRecentChallenges
        ? challenges.findRecent(profileId, 10)
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
    getActive(profileId: string) {
      profiles.assertExists(profileId);
      return challenges.findActive(profileId).map(toChallenge);
    },

    getSaved(profileId: string) {
      profiles.assertExists(profileId);
      return challenges.findSaved(profileId).map(toChallenge);
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
      const [min, max] = DIFFICULTY_BANDS[input.difficulty];
      let feedback: string | null = null;
      let generated:
        Awaited<ReturnType<ModelGateway["generateBuild"]>> | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        let issues: string[];
        try {
          generated = await llm.generateBuild({
            ...modelInput,
            calibrationFeedback: feedback,
          });
          issues = briefIssues(generated, input.scope, input.difficulty);
          if (!issues.length) {
            const assessment = await llm.assessBuild(modelInput, generated);
            issues.push(...assessment.issues);
            if (!assessment.relevant)
              issues.push(
                "Solving the task must require the explicitly requested subject.",
              );
            if (!assessment.scopeMatches)
              issues.push(
                "Reduce or adjust implementation breadth to match the selected scope.",
              );
            if (!assessment.prerequisitesMatch)
              issues.push(
                "Remove unfamiliar or unrelated prerequisites; respect current learner familiarity.",
              );
            if (
              assessment.estimatedDifficultyScore < min ||
              assessment.estimatedDifficultyScore > max
            )
              issues.push(
                `Independent estimate is ${assessment.estimatedDifficultyScore}/10: ${assessment.difficultyReason}. Change actual reasoning demands to fit ${input.difficulty} (${min}–${max}), not just the label.`,
              );
            generated = {
              ...generated,
              estimatedDifficultyScore: assessment.estimatedDifficultyScore,
              difficultyReason: assessment.difficultyReason,
            };
          }
        } catch (error) {
          if (
            !(error instanceof AppError) ||
            error.code !== "MODEL_OUTPUT_INVALID"
          )
            throw error;
          issues = [
            "Return valid structured output matching all field limits.",
          ];
        }
        if (!issues.length && generated) break;
        feedback = issues.join("\n");
        generated = undefined;
      }
      if (!generated)
        throw new AppError(
          "CHALLENGE_QUALITY_MISMATCH",
          "The generated challenge did not meet topic, difficulty, or readability requirements after one repair. Please retry.",
          502,
          true,
        );
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
      return toChallenge(challenges.complete(id)!);
    },
    setStatus(
      id: string,
      profileId: string,
      status: "active" | "paused" | "saved" | "stopped",
    ) {
      owned(id, profileId);
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
