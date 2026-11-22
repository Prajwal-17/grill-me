import {
  requestPromptContext,
  PROMPT_VERSION,
  CALIBRATION_VERSION,
  CONTRACT_VERSION,
} from "../ai/prompts/core";
import type { ModelSelection } from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import type { BuildModelInput, ModelGateway } from "../ai/model-gateway";
import type { MessageModel } from "../messages/message.model";
import type { ProfileService } from "../profiles/profile.service";
import type { ChallengeModel } from "./challenge.model";
import type { GenerationRun } from "../generations/generation.schema";
import {
  challengeContentSchema,
  buildGenerationResultSchema,
  challengePreparationSchema,
  enhanceBuildPromptSchema,
  scopeResolutionResultSchema,
  type BuildDifficulty,
  type BuildScope,
  type GenerateChallengeInput,
} from "./challenge.schema";
import {
  requireActiveChallenge,
  requireChallenge,
  toChallenge,
} from "./challenge.utils";
import type { ChallengeWorkspaceService } from "./workspace";
import type { ProjectPreparationService } from "./project-preparation.service";

export function createChallengeService(dependencies: {
  challenges: ChallengeModel;
  messages: MessageModel;
  profiles: ProfileService;
  llm: ModelGateway;
  workspaces: ChallengeWorkspaceService;
  preparations?: ProjectPreparationService;
}) {
  const { challenges, profiles, llm, workspaces, preparations } = dependencies;
  // Remember valid essential questions so a client cannot skip one after preparation.
  // Bounded to avoid retaining abandoned requests indefinitely in this local server.
  const pendingQuestions = new Map<
    string,
    { question: string; options: string[] }
  >();
  const questionKey = (
    profileId: string,
    input: {
      prompt: string;
      scope: BuildScope | "auto";
      difficulty: BuildDifficulty;
    },
  ) => JSON.stringify([profileId, input.prompt, input.scope, input.difficulty]);
  function remember(
    key: string,
    question: { question: string; options: string[] },
  ) {
    if (pendingQuestions.size >= 500)
      pendingQuestions.delete(pendingQuestions.keys().next().value!);
    pendingQuestions.set(key, question);
  }
  function needsClarification(question: {
    question: string;
    options: string[];
  }): never {
    throw new AppError(
      "CHALLENGE_NEEDS_CLARIFICATION",
      "Answer this essential question before creating the challenge.",
      409,
      false,
      question,
    );
  }

  async function owned(id: string, profileId: string) {
    await profiles.assertExists(profileId);
    return requireChallenge(await challenges.findOwned(id, profileId));
  }

  async function learnerContext(profileId: string) {
    const preferences = await profiles.getPreferences(profileId);
    // Practice history never enriches a new AI request. Existing history screens
    // and stored rows remain unchanged.
    return {
      profileId,
      preferences,
      recentChallenges: [],
    };
  }

  /**
   * Resolves an Auto scope selection from the prompt. The chosen scope must be
   * stable for the whole run: callers key remembered questions by the raw
   * requested scope, and every later stage uses the resolved value.
   */
  async function resolveScope(
    input: {
      prompt: string;
      scope: BuildScope | "auto";
      selection?: ModelSelection;
    },
    profileId: string,
    generation?: GenerationRun,
  ): Promise<BuildScope> {
    if (input.scope !== "auto") return input.scope;
    if (!llm.resolveBuildScope)
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "This model does not support automatic scope selection. Pick Focused, Feature, or System instead.",
        503,
        true,
      );
    const resolved = scopeResolutionResultSchema.safeParse(
      await llm.resolveBuildScope({
        prompt: input.prompt,
        learner: await learnerContext(profileId),
        selection: input.selection,
        signal: generation?.signal,
        harness: generation?.harness,
      }),
    );
    if (!resolved.success)
      throw new AppError(
        "MODEL_OUTPUT_INVALID",
        "The model did not return a valid scope. Try again or pick Focused, Feature, or System yourself.",
        502,
        true,
      );
    return resolved.data.scope;
  }

  return {
    async enhancePrompt(
      profileId: string,
      prompt: string,
      selection?: ModelSelection,
    ) {
      await profiles.assertExists(profileId);
      if (!llm.enhanceBuildPrompt)
        throw new AppError(
          "MODEL_UNAVAILABLE",
          "This model does not support prompt enhancement.",
          503,
        );
      const output = enhanceBuildPromptSchema.safeParse(
        await llm.enhanceBuildPrompt({ profileId, prompt, selection }),
      );
      if (!output.success)
        throw new AppError(
          "MODEL_OUTPUT_INVALID",
          "The model returned an invalid enhanced prompt. Try again or edit it yourself.",
          502,
          true,
        );
      return output.data;
    },

    async getActive(profileId: string) {
      await profiles.assertExists(profileId);
      return (await challenges.findActive(profileId)).map(toChallenge);
    },

    async getSaved(profileId: string) {
      await profiles.assertExists(profileId);
      return (await challenges.findSaved(profileId)).map(toChallenge);
    },

    async getArchived(profileId: string) {
      await profiles.assertExists(profileId);
      return (await challenges.findArchived(profileId)).map(toChallenge);
    },

    async setArchived(id: string, profileId: string, archived: boolean) {
      await owned(id, profileId);
      return toChallenge((await challenges.setArchived(id, archived))!);
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
        scope: BuildScope | "auto";
        difficulty: BuildDifficulty;
        selection?: ModelSelection;
      },
      profileId: string,
      generation?: GenerationRun,
    ) {
      await profiles.assertExists(profileId);
      // Auto resolves before the clarification pass so its prompt sees the
      // concrete scope; the caller reuses the result for generation.
      const scope = await resolveScope(input, profileId, generation);
      const output = challengePreparationSchema.safeParse(
        await llm.prepareBuild({
          ...input,
          scope,
          signal: generation?.signal,
          harness: generation?.harness,
          learner: await learnerContext(profileId),
        }),
      );
      if (!output.success)
        throw new AppError(
          "MODEL_OUTPUT_INVALID",
          "The model did not return a valid preparation. Try again.",
          502,
          true,
        );
      if (output.data.question)
        remember(questionKey(profileId, input), {
          question: output.data.question,
          options: output.data.options,
        });
      return { ...output.data, scope };
    },

    async generate(
      input: GenerateChallengeInput,
      profileId: string,
      generation?: GenerationRun,
      resolved?: { scope?: BuildScope },
    ) {
      await profiles.assertExists(profileId);
      const history = [...input.clarificationHistory];
      if (
        input.clarificationContext &&
        !history.some(
          (item) =>
            item.question === input.clarificationContext!.question &&
            item.answer === input.clarificationContext!.answer,
        )
      )
        history.push(input.clarificationContext);
      // Remembered questions are keyed by the raw request, before Auto
      // resolution, so the clarification check matches the prepare pass.
      const key = questionKey(profileId, input);
      const pending = pendingQuestions.get(key);
      if (
        pending &&
        !history.some(
          (item) => item.question === pending.question && item.answer.trim(),
        )
      )
        needsClarification(pending);
      const scope =
        resolved?.scope ?? (await resolveScope(input, profileId, generation));
      let modelInput: BuildModelInput = {
        ...input,
        scope,
        signal: generation?.signal,
        harness: generation?.harness,
        clarificationHistory: history,
        learner: await learnerContext(profileId),
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        const output = buildGenerationResultSchema(scope).safeParse(
          await llm.generateBuild(modelInput),
        );
        if (!output.success)
          throw new AppError(
            "MODEL_OUTPUT_INVALID",
            "The model did not return a valid build. Try again.",
            502,
            true,
          );
        const generated = output.data;
        if (generated.status === "needs_clarification") {
          const question = {
            question: generated.question!,
            options: generated.options,
          };
          remember(key, question);
          needsClarification(question);
        }
        const challenge = generated.challenge!;
        if (challenge.estimatedDifficultyBand !== input.difficulty) {
          if (attempt === 1)
            throw new AppError(
              "MODEL_DIFFICULTY_MISMATCH",
              "The model could not match the selected difficulty after one correction. Try again or adjust your request.",
              502,
              true,
            );
          modelInput = {
            ...modelInput,
            calibrationFeedback: {
              selectedDifficulty: input.difficulty,
              estimatedBand: challenge.estimatedDifficultyBand,
              reason: challenge.difficultyReason,
              previousChallenge: challenge,
            },
          };
          continue;
        }
        // A starting point is an explicit request, not a model-chosen setup.
        const startingPoint = challenge.startingPoint;
        const startingPointSource = [
          input.prompt,
          ...history.map(({ answer }) => answer),
        ];
        const explicitStartingPoint =
          startingPoint &&
          startingPointSource.some((source) => source.includes(startingPoint))
            ? startingPoint
            : undefined;
        const finalBuild = challengeContentSchema.parse({
          ...challenge,
          estimatedDifficultyScore: null,
          scope,
          difficulty: input.difficulty,
          contextualDifficulty: challenge.estimatedDifficultyBand,
        });
        const row = await challenges.create(
          profileId,
          finalBuild,
          input.prompt,
          {
            ...JSON.parse(requestPromptContext(modelInput)),
            ...(explicitStartingPoint
              ? { startingPoint: explicitStartingPoint }
              : {}),
            promptVersion: PROMPT_VERSION,
            calibrationVersion: CALIBRATION_VERSION,
            contractVersion: CONTRACT_VERSION,
            requestedModel: process.env.LLM_MODEL ?? "auto",
          },
          generation,
        );
        pendingQuestions.delete(key);
        try {
          const workspace = await workspaces.ensure(row);
          const updated = await challenges.setWorkspacePath(
            row.id,
            workspace.path,
          );
          const saved = toChallenge(
            updated ?? { ...row, workspacePath: workspace.path },
          );
          // Kick off the frozen specification and background preparation only
          // after the challenge row and workspace are saved. Preparation
          // failures never remove or roll back the challenge.
          if (preparations?.available())
            await preparations
              .start(profileId, saved.id, {
                selection: input.selection,
                request: input.prompt,
              })
              .catch(() => {});
          return saved;
        } catch (error) {
          // The challenge remains usable without its optional folder. Opening
          // the workspace later retries initialization and reports the reason.
          console.error(
            "Challenge workspace could not be initialized:",
            error instanceof Error ? error.message : error,
          );
          return toChallenge(row);
        }
      }
      throw new Error("Unreachable generation state");
    },

    async workspace(id: string, profileId: string, relink = false) {
      const row = await owned(id, profileId);
      const workspace = await workspaces.ensure(row, { relink });
      if (row.workspacePath !== workspace.path)
        await challenges.setWorkspacePath(row.id, workspace.path);
      return workspace;
    },

    async complete(id: string, profileId: string) {
      const challenge = await owned(id, profileId);
      if (challenge.archivedAt || challenge.status === "saved")
        throw new AppError(
          "CHALLENGE_INACTIVE",
          "Restore this challenge before changing its status.",
          409,
        );
      if (challenge.status === "completed") return toChallenge(challenge);
      return toChallenge((await challenges.complete(id))!);
    },
    async setStatus(
      id: string,
      profileId: string,
      status: "active" | "paused" | "saved" | "stopped",
    ) {
      const challenge = await owned(id, profileId);
      if (challenge.archivedAt)
        throw new AppError(
          "CHALLENGE_INACTIVE",
          "Restore this challenge before changing its status.",
          409,
        );
      return toChallenge((await challenges.setStatus(id, status))!);
    },

    owned,
  };
}

export type ChallengeService = ReturnType<typeof createChallengeService>;
