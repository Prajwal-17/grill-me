import { z } from "zod";
import {
  generatedBuildSchemaForScope,
  type BuildScope,
} from "../../challenges/challenge.schema";
export const preparationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "options"],
  properties: {
    question: { type: ["string", "null"], minLength: 5, maxLength: 240 },
    options: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 160 },
      maxItems: 3,
    },
  },
};
export function buildJsonSchema(scope: BuildScope) {
  return z.toJSONSchema(generatedBuildSchemaForScope(scope));
}
export function structuredOutputInstruction(
  stage: string,
  _schema: Record<string, unknown>,
) {
  return (
    "Return only the JSON object required by the response schema. " +
    (stage === "preparation"
      ? "Use question:null and options:[] when clarification is unnecessary; otherwise 2–3 distinct choices."
      : "Do not include Markdown fences or surrounding prose.")
  );
}
