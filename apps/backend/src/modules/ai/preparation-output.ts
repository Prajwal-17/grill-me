// Some compatible providers serialize "no clarification" with an empty string.
// Normalize only this unambiguous empty state; never discard actual choices.
export function normalizePreparationOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const output = value as Record<string, unknown>;
  const noQuestion =
    output.question === null ||
    (typeof output.question === "string" && !output.question.trim());
  const noOptions =
    output.options == null ||
    (Array.isArray(output.options) && output.options.length === 0);
  return noQuestion && noOptions
    ? { ...output, question: null, options: [] }
    : value;
}
