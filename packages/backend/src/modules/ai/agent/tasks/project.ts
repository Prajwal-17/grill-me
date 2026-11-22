import { z } from "zod";
import { projectScaffoldReportSchema } from "@repo/backend/shared/contracts";
import type { ProjectScaffoldModelInput } from "../../model-gateway";
import { projectScaffoldInstructions } from "../../prompts";
import { validateProjectScaffoldReport } from "../../../challenges/project-preparation.validation";
import { contextBlock } from "../messages";
import type { StructuredTask } from "./types";
import { AppError } from "../../../../shared/errors/app-error";

// Required for new model completions, optional in stored reports so existing
// preparation history and older gateway implementations remain readable.
const completionReportSchema = projectScaffoldReportSchema.required({
  blockingProblems: true,
});

export function projectScaffoldTask(
  input: ProjectScaffoldModelInput,
): StructuredTask<unknown> {
  const { specification, continuation, previousAttempt } = input;
  const {
    problemStatement,
    expectedOutcome,
    implementationBoundary,
    acceptanceCriteria,
  } = specification;
  // Only deduplicate whole entries. Older statements may overlap with the
  // criteria, but removing prose could change the frozen requirements.
  const normalized = (value: string) => value.trim().replace(/\s+/g, " ");
  const stated = new Set(
    [problemStatement, implementationBoundary ?? "", ...acceptanceCriteria].map(
      normalized,
    ),
  );
  const includeOutcome = !stated.has(normalized(expectedOutcome));
  stated.add(normalized(expectedOutcome));
  const objectives = specification.objectives.filter(
    (objective) => !stated.has(normalized(objective)),
  );
  return {
    operation: "project_scaffolding",
    instructions: projectScaffoldInstructions(Boolean(continuation)),
    context: [
      contextBlock("challenge", {
        title: specification.title,
        task: problemStatement,
        acceptanceCriteria,
        ...(implementationBoundary ? { implementationBoundary } : {}),
        ...(includeOutcome ? { expectedOutcome } : {}),
        ...(objectives.length ? { objectives } : {}),
        scope: specification.scope,
        difficulty: specification.difficulty,
        durationEstimate: specification.durationEstimate,
      }),
      ...(specification.stack.experienceLevel
        ? [
            contextBlock("developer_context", {
              experienceLevel: specification.stack.experienceLevel,
            }),
          ]
        : []),
      contextBlock("preparation", {
        startingPoint:
          specification.startingPoint ??
          "Not specified. Prepare the minimal useful environment for the exercise and leave optional setup decisions open. Leave setup to the engineer only when the request or task explicitly gives it to them.",
      }),
      contextBlock(
        "workspace",
        {
          root: ".",
          note: "Tool paths are relative to the project root. Read CHALLENGE.md if you need the full saved brief.",
        },
        { untrusted: false },
      ),
      ...(continuation
        ? [
            contextBlock(
              "resume_continuation",
              {
                missingJournaledFiles: continuation.missingFiles,
                missingJournaledFileCount: continuation.missingFileCount,
              },
              { untrusted: false },
            ),
          ]
        : []),
      ...(previousAttempt
        ? [
            contextBlock("previous_attempt", {
              status: previousAttempt.status,
              summary: previousAttempt.summary,
              problems: previousAttempt.problems,
              error: previousAttempt.error?.message,
            }),
          ]
        : []),
    ].join("\n\n"),
    userText: specification.request,
    completion: {
      name: "complete_project_scaffold",
      description:
        "Report the starting environment, if any, and its verification. List journaled files, applicable TODOs, commands, check results, and blockers. Lists may be empty. This call ends project preparation.",
      schema: z.toJSONSchema(completionReportSchema),
      validate: async (value) => {
        const parsed = completionReportSchema.safeParse(value);
        if (!parsed.success)
          throw new AppError(
            "PROJECT_SCAFFOLD_INVALID",
            "Return a preparation report with blockingProblems: [] if there are no blockers, or list any unresolved preparation failures there.",
            502,
            true,
            { issues: z.prettifyError(parsed.error).split("\n").slice(0, 40) },
          );
        return validateProjectScaffoldReport(parsed.data, {
          layout: input.layout,
          specification: input.specification,
          allowExecutionResults: Boolean(input.commandResults),
          commands: input.commandResults
            ? await input.commandResults()
            : undefined,
        });
      },
    },
    allowSnapshot: false,
    allowResearch: false,
    limits: {
      // A full practice project needs many create, install, and check turns.
      // The operation timeout still bounds the run.
      maxTurns: 60,
      maxToolCalls: 180,
      maxTextChars: 32_000,
    },
  };
}
