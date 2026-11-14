import type {
  BuildModelInput,
  JudgeInput,
  ModelGateway,
  ProjectScaffoldModelInput,
  QuizModelInput,
  QuizTitleModelInput,
} from "../model-gateway";
import type { Manifest } from "../../projects/snapshot";
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
  verificationTask,
} from "./tasks";
import { createProjectTools, projectToolJournalContext } from "./tools/project";
import { createProjectCommandTool } from "./tools/command";

function imageAttachments(attachments: JudgeInput["attachments"]) {
  return attachments.filter(
    (attachment) => attachment.data && attachment.mimeType,
  );
}

export function createPiGateway(runtime: AgentRuntime): ModelGateway {
  const executor = createAgentExecutor({
    runtime,
    slots: createLimiter(2),
    resources: createResourceLocks(),
  });

  async function judgeWithSnapshot(
    input: JudgeInput,
    workspace: string,
    manifest: Manifest,
  ) {
    const result = await executor.structured(
      {
        profileId: input.challenge.profileId,
        operation: "review",
        challengeId: input.challenge.id,
        resourceKind: "review",
        resourceId: workspace,
        preview: input.challenge.title,
        selection: input.selection,
        signal: input.signal,
      },
      reviewTask(input, true),
      {
        workspace,
        manifest,
        attachments: imageAttachments(input.attachments),
      },
    );
    return result.value as Awaited<
      ReturnType<NonNullable<ModelGateway["reviewWorkspace"]>>
    >;
  }

  return {
    reviewWorkspace: judgeWithSnapshot,

    async enhanceBuildPrompt(input) {
      const result = await executor.structured(
        {
          profileId: input.profileId,
          operation: "prompt_enhancement",
          preview: input.prompt,
          selection: input.selection,
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
        },
        quizTitleTask(input),
      );
      return result.value.title;
    },

    async judge(input: JudgeInput) {
      const result = await executor.structured(
        {
          profileId: input.challenge.profileId,
          operation: "review",
          challengeId: input.challenge.id,
          resourceKind: "review",
          resourceId: input.workspace ?? input.challenge.id,
          preview: input.challenge.title,
          selection: input.selection,
          signal: input.signal,
        },
        reviewTask(input, Boolean(input.workspace)),
        input.workspace
          ? {
              workspace: input.workspace,
              manifest: [],
              attachments: imageAttachments(input.attachments),
            }
          : { attachments: input.attachments },
      );
      return result.value as Awaited<
        ReturnType<NonNullable<ModelGateway["judge"]>>
      >;
    },

    async planVerification(input: JudgeInput) {
      const result = await executor.structured(
        {
          profileId: input.challenge.profileId,
          operation: "verification",
          challengeId: input.challenge.id,
          preview: "Verification: " + input.challenge.title,
          selection: input.selection,
          signal: input.signal,
        },
        verificationTask(input),
        input.workspace
          ? { workspace: input.workspace, manifest: [] }
          : { attachments: input.attachments },
      );
      return result.value as Awaited<
        ReturnType<NonNullable<ModelGateway["planVerification"]>>
      >;
    },

    async prepareBuild(input) {
      const result = await executor.structured(
        {
          profileId: input.learner.profileId,
          operation: "preparation",
          preview: input.prompt,
          selection: input.selection,
          signal: input.signal,
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
        },
        projectScaffoldTask(input),
        {
          tools: [
            ...createProjectTools({
              root: input.layout.projectRoot,
              journal: projectToolJournalContext(input.layout),
              signal: input.signal,
              onActivity: input.onActivity,
            }),
            // The command tool is task-scoped and only exists while the service
            // supplies an executor bound to this exact preparation attempt.
            ...(input.runProjectCommand
              ? [createProjectCommandTool(input.runProjectCommand)]
              : []),
          ],
          // Project preparation state is workflow state, not a diagnostic log.
          observability: false,
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
        },
        hintTask(input),
        conversationMessages(input.messages),
      );
    },
  };
}
