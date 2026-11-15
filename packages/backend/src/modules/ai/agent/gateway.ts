import type {
  BuildModelInput,
  ModelGateway,
  ProjectScaffoldModelInput,
  QuizModelInput,
  QuizTitleModelInput,
} from "../model-gateway";
import { createAgentExecutor } from "./execute";
import { createLimiter, createResourceLocks } from "./limiter";
import { conversationMessages } from "./messages";
import type { AgentRuntime } from "./types";
import {
  conversationTask,
  enhancementTask,
  generationTask,
  hintTask,
  preparationTask,
  projectScaffoldTask,
  quizTask,
  quizTitleTask,
  resumeTask,
  reviewTask,
} from "./tasks";
import { createProjectTools, projectToolJournalContext } from "./tools/project";
import { createProjectCommandTool } from "./tools/command";
import { createReviewTools, reviewWorkspaceInventory } from "./tools/review";

export function createPiGateway(runtime: AgentRuntime): ModelGateway {
  const executor = createAgentExecutor({
    runtime,
    slots: createLimiter(2),
    resources: createResourceLocks(),
  });

  return {
    async enhanceBuildPrompt(input) {
      const result = await executor.structured(
        {
          profileId: input.profileId,
          operation: "prompt_enhancement",
          preview: input.prompt,
          selection: input.selection,
          harness: input.harness,
        },
        enhancementTask({ ...input, target: "build" }),
      );
      return result.value;
    },

    async enhanceQuizPrompt(input) {
      const result = await executor.structured(
        {
          profileId: input.profileId,
          operation: "prompt_enhancement",
          preview: input.prompt,
          selection: input.selection,
          harness: input.harness,
        },
        enhancementTask({ ...input, target: "quiz" }),
      );
      return result.value;
    },

    async extractResume(input) {
      const result = await executor.structured(
        {
          profileId: input.profileId,
          operation: "resume_import",
          preview: "Resume profile draft",
          selection: input.selection,
          signal: input.signal,
          harness: input.harness,
        },
        resumeTask(input),
      );
      return result.value;
    },

    async generateQuiz(input: QuizModelInput) {
      const profileId =
        input.challenge !== null ? input.challenge.profileId : input.profileId;
      const result = await executor.structured(
        {
          profileId,
          operation: "quiz_generation",
          challengeId: input.challenge?.id ?? null,
          resourceKind: "quiz",
          resourceId: input.challenge?.id ?? profileId,
          preview: input.challenge
            ? input.challenge.title
            : input.prompt.slice(0, 200),
          selection: input.selection,
          signal: input.signal,
          harness: input.harness,
        },
        quizTask(input),
      );
      return result.value as Awaited<
        ReturnType<NonNullable<ModelGateway["generateQuiz"]>>
      >;
    },

    async generateQuizTitle(input: QuizTitleModelInput) {
      const result = await executor.structured(
        {
          profileId: input.profileId,
          operation: "quiz_title_generation",
          challengeId: input.challengeId,
          preview: input.currentTitle,
          selection: input.selection,
          harness: input.harness,
        },
        quizTitleTask(input),
      );
      return result.value.title;
    },

    async reviewChallenge(input) {
      const inventory = await reviewWorkspaceInventory(input.workspacePath);
      const result = await executor.structured(
        {
          profileId: input.profileId,
          operation: "review",
          challengeId: input.challengeId,
          resourceKind: "challenge",
          resourceId: input.challengeId,
          preview: `Review #${input.challenge.number} ${input.challenge.title}`,
          selection: input.selection,
          signal: input.signal,
          harness: input.harness,
        },
        reviewTask({
          ...input,
          inventory: inventory.files,
          truncated: inventory.truncated,
        }),
        { tools: createReviewTools(inventory.root) },
      );
      return result.value;
    },

    async prepareBuild(input) {
      const result = await executor.structured(
        {
          profileId: input.learner.profileId,
          operation: "preparation",
          preview: input.prompt,
          selection: input.selection,
          signal: input.signal,
          harness: input.harness,
        },
        preparationTask(input),
      );
      return result.value as Awaited<ReturnType<ModelGateway["prepareBuild"]>>;
    },

    async generateBuild(input: BuildModelInput) {
      const result = await executor.structured(
        {
          profileId: input.learner.profileId,
          operation: "generation",
          preview: input.prompt,
          selection: input.selection,
          signal: input.signal,
          harness: input.harness,
        },
        generationTask(input),
      );
      return result.value as Awaited<ReturnType<ModelGateway["generateBuild"]>>;
    },

    async scaffoldProject(input: ProjectScaffoldModelInput) {
      const result = await executor.structured(
        {
          profileId: input.profileId,
          operation: "project_scaffolding",
          challengeId: input.challengeId,
          resourceKind: "project_preparation",
          resourceId: `${input.challengeId}:${input.layout.projectDirectory}`,
          preview: input.specification.title,
          selection: input.selection,
          signal: input.signal,
          harness: input.harness,
        },
        projectScaffoldTask(input),
        {
          tools: [
            ...createProjectTools({
              root: input.layout.projectRoot,
              journal: projectToolJournalContext(input.layout),
              signal: input.signal,
              permissionMode: input.permissionMode,
              requestPermission: input.requestPermission,
              onActivity: input.onActivity,
            }),
            ...(input.runProjectCommand
              ? [
                  createProjectCommandTool(input.runProjectCommand, {
                    permissionMode: input.permissionMode,
                    requestPermission: input.requestPermission,
                    signal: input.signal,
                  }),
                ]
              : []),
          ],
        },
      );
      return result.value as Awaited<
        ReturnType<NonNullable<ModelGateway["scaffoldProject"]>>
      >;
    },

    respond(input) {
      return executor.text(
        {
          profileId: input.learner.profileId,
          operation: input.mode,
          challengeId: input.challenge.id,
          resourceKind: "conversation",
          resourceId: input.challenge.id,
          preview: input.content || input.challenge.title,
          selection: input.selection,
          signal: input.signal,
          harness: input.harness,
        },
        conversationTask(input),
        conversationMessages(input.messages),
      );
    },

    generateHint(input) {
      return executor.text(
        {
          profileId: input.learner.profileId,
          operation: "hint",
          challengeId: input.challenge.id,
          resourceKind: "conversation",
          resourceId: input.challenge.id,
          preview: input.challenge.title,
          selection: input.selection,
          harness: input.harness,
        },
        hintTask(input),
        conversationMessages(input.messages),
      );
    },
  };
}
