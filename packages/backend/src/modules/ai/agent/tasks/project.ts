import { z } from "zod";
import { projectScaffoldReportSchema } from "@repo/backend/shared/contracts";
import type { ProjectScaffoldModelInput } from "../../model-gateway";
import { projectScaffoldInstructions } from "../../prompts";
import { validateProjectScaffoldReport } from "../../../challenges/project-preparation.validation";
import { contextBlock } from "../messages";
import type { StructuredTask } from "./types";

export function projectScaffoldTask(
  input: ProjectScaffoldModelInput,
): StructuredTask<unknown> {
  return {
    operation: "project_scaffolding",
    instructions: projectScaffoldInstructions(),
    context: [
      contextBlock("frozen_specification", input.specification, {
        untrusted: false,
      }),
      contextBlock(
        "stack_and_model",
        {
          stack: input.specification.stack,
          requestedModel: input.specification.model.label,
          projectRoot: input.layout.projectRoot,
          projectDirectory: input.layout.projectDirectory,
        },
        { untrusted: false },
      ),
      contextBlock(
        "project_layout",
        {
          note: "Use paths relative to the project root with the project tools. Never use an absolute path or escape the root.",
          projectRoot: input.layout.projectRoot,
          projectDirectory: input.layout.projectDirectory,
          artifactsFolder:
            "artifacts (challenge-owned, outside the project tools root)",
        },
        { untrusted: false },
      ),
      ...(input.previousAttempt
        ? [
            contextBlock("previous_attempt", input.previousAttempt, {
              untrusted: true,
            }),
          ]
        : []),
    ].join("\n\n"),
    userText: input.specification.request,
    completion: {
      name: "complete_project_scaffold",
      description:
        "Return the complete, validated scaffold report after creating the project files. List every generated file, TODO location, proposed setup/run/check command, check result, and remaining problem. This call ends project preparation.",
      schema: z.toJSONSchema(projectScaffoldReportSchema),
      validate: (value) =>
        validateProjectScaffoldReport(value, {
          layout: input.layout,
          specification: input.specification,
        }),
    },
    allowSnapshot: false,
    allowResearch: false,
    limits: {
      maxTurns: 40,
      maxToolCalls: 120,
      maxTextChars: 32_000,
    },
  };
}
