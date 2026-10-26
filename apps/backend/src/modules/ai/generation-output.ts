import { normalizePreparationOutput } from "./preparation-output";

export function normalizeGenerationOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const output = value as Record<string, unknown>;
  // Only a ready build with no choices can unambiguously mean no question.
  // Leave clarification responses and missing or malformed fields to validation.
  return output.status === "ready" &&
    Array.isArray(output.options) &&
    output.options.length === 0
    ? normalizePreparationOutput(value)
    : value;
}
