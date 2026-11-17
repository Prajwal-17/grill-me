import type { AgentTool } from "@earendil-works/pi-agent-core";
import { AppError } from "../../../../shared/errors/app-error";

const MAX_VALIDATION_DETAIL = 2_000;
const MAX_FATAL_DETAIL = 1_000;

export type CompletionState<T> = {
  value?: T;
  failures: number;
  fatal?: AppError;
  /** The most recent bounded rejection, echoed back to the model and the run. */
  lastFailure?: string;
  /** Structured validator issues from the most recent rejection. */
  lastIssues?: string[];
};

function bounded(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function validationIssues(error: unknown) {
  if (!(error instanceof AppError) || !Array.isArray(error.details?.issues))
    return [];
  return error.details.issues.filter(
    (issue): issue is string =>
      typeof issue === "string" && issue.trim().length > 0,
  );
}

/**
 * Render a rejected completion so the model can correct the specific problem.
 * Validators keep the useful part of a failure in `details.issues`; without
 * this the model only sees a generic "did not match the contract" message and
 * cannot tell which field or rule failed.
 */
export function validationDetail(error: unknown) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "The result did not match the required contract.";
  const issues = validationIssues(error);
  if (!issues.length) return bounded(message, MAX_VALIDATION_DETAIL);
  return bounded(
    [
      message,
      ...issues.map((issue, index) => `${index + 1}. ${issue.trim()}`),
    ].join("\n"),
    MAX_VALIDATION_DETAIL,
  );
}

export function recordCompletionFailure<T>(
  spec: CompletionSpec<T>,
  state: CompletionState<T>,
  abort: (error: AppError) => void,
) {
  state.failures++;
  if (state.failures < 3) return;
  const rejection = state.lastFailure
    ? ` The last result was rejected: ${bounded(state.lastFailure, MAX_FATAL_DETAIL)}`
    : "";
  const fatal = new AppError(
    "MODEL_OUTPUT_INVALID",
    `The model could not produce a valid result after two correction attempts.${rejection} Try again.`,
    502,
    true,
    state.lastIssues?.length
      ? { issues: state.lastIssues.slice(0, 40) }
      : undefined,
  );
  state.fatal = fatal;
  abort(fatal);
}

export type CompletionSpec<T> = {
  name: string;
  label?: string;
  description: string;
  schema: object;
  validate: (value: unknown) => T | Promise<T>;
};

export function createCompletionTool<T>(
  spec: CompletionSpec<T>,
  state: CompletionState<T>,
): AgentTool<any> {
  return {
    name: spec.name,
    label: spec.label ?? spec.name,
    description: spec.description,
    parameters: spec.schema,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      if (state.value !== undefined)
        throw new Error(
          `A result was already accepted by ${spec.name}. Do not call it again.`,
        );
      try {
        state.value = await spec.validate(params);
      } catch (error) {
        const detail = validationDetail(error);
        state.lastFailure = detail;
        state.lastIssues = validationIssues(error);
        throw new Error(
          `${detail}\n\nCorrect the result and call ${spec.name} again with the complete object.`,
          { cause: error },
        );
      }
      return {
        content: [
          {
            type: "text" as const,
            text: "Result accepted. Do not call this tool again.",
          },
        ],
        details: { accepted: true },
        terminate: true,
      };
    },
  };
}
