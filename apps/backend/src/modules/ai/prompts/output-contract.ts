import { z } from "zod";
import {
  buildGenerationResultSchema,
  type BuildScope,
} from "../../challenges/challenge.schema";
export const preparationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "options"],
  properties: {
    question: {
      type: ["string", "null"],
      minLength: 5,
      maxLength: 240,
      description:
        'Ask only for an essential missing contract or a conflicting requirement. Use the JSON null value (not the string "null") for ordinary practice requests. Never put the assignment or a request for code here.',
    },
    options: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 160 },
      maxItems: 3,
    },
  },
};
export function buildJsonSchema(scope: BuildScope) {
  return z.toJSONSchema(buildGenerationResultSchema(scope));
}
export function structuredOutputInstruction(
  stage: string,
  _schema: Record<string, unknown>,
) {
  return (
    "Return only the JSON object required by the response schema. " +
    (stage === "preparation"
      ? "Use the JSON null value for question and an empty options array when clarification is unnecessary; do not quote null as a string. Otherwise use no choices for free text or 2–3 distinct choices."
      : "Do not include Markdown fences or surrounding prose.")
  );
}
