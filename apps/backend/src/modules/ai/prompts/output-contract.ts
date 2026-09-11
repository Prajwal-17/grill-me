import {
  BUILD_SCOPE_LIMITS,
  type BuildScope,
} from "../../challenges/challenge.schema";

const baseBuildProperties = {
  title: { type: "string", minLength: 3, maxLength: 120 },
  problemStatement: { type: "string", minLength: 20 },
  expectedOutcome: { type: "string", minLength: 10 },
  constraints: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: { type: "string", minLength: 1 },
  },
  starterCode: { type: ["string", "null"] },
  completionCriteria: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: { type: "string", minLength: 1 },
  },
  durationEstimate: {
    type: "object",
    additionalProperties: false,
    required: ["minMinutes", "maxMinutes"],
    properties: {
      minMinutes: { type: "integer", minimum: 1 },
      maxMinutes: { type: "integer", minimum: 1 },
    },
  },
  implementationMilestones: {
    type: "array",
    items: { type: "string", minLength: 1, maxLength: 300 },
  },
} as const;

export const preparationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "options"],
  properties: {
    question: { type: ["string", "null"], minLength: 5, maxLength: 240 },
    options: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 160 },
      minItems: 0,
      maxItems: 3,
    },
  },
} as const;

export function buildJsonSchema(scope: BuildScope) {
  const limits = BUILD_SCOPE_LIMITS[scope];
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "problemStatement",
      "expectedOutcome",
      "constraints",
      "starterCode",
      "completionCriteria",
      "durationEstimate",
      "implementationMilestones",
    ],
    properties: {
      ...baseBuildProperties,
      problemStatement: {
        ...baseBuildProperties.problemStatement,
        maxLength: limits.statement,
      },
      implementationMilestones: {
        ...baseBuildProperties.implementationMilestones,
        minItems: limits.minMilestones,
        maxItems: limits.maxMilestones,
      },
    },
  } as const;
}

export function structuredOutputInstruction(
  stage: "preparation" | "generation",
  schema: Record<string, unknown>,
) {
  const preparationRule =
    stage === "preparation"
      ? " Use question:null and options:[] when clarification is unnecessary; otherwise provide 2–3 distinct options."
      : " The duration range must use positive integer minutes with minMinutes less than or equal to maxMinutes.";
  return (
    "Return exactly one JSON object matching this schema, without commentary or Markdown." +
    preparationRule +
    "\n" +
    JSON.stringify(schema)
  );
}
