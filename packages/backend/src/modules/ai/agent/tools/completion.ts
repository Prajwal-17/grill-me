import type { AgentTool } from "@earendil-works/pi-agent-core";
import { AppError } from "../../../../shared/errors/app-error";

export type CompletionState<T> = {
  value?: T;
  failures: number;
  fatal?: AppError;
};

export function recordCompletionFailure<T>(
  spec: CompletionSpec<T>,
  state: CompletionState<T>,
  abort: (error: AppError) => void,
) {
  state.failures++;
  if (state.failures < 3) return;
  const fatal = new AppError(
    "MODEL_OUTPUT_INVALID",
    "The model could not produce a valid result after two correction attempts. Try again.",
    502,
    true,
  );
  state.fatal = fatal;
  abort(fatal);
}

export type CompletionSpec<T> = {
  name: string;
  label?: string;
  description: string;
  schema: object;
  validate: (value: unknown) => T;
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
        state.value = spec.validate(params);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The result did not match the required contract.";
        throw new Error(
          `${message} Correct the result and call ${spec.name} again with the complete object.`,
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
