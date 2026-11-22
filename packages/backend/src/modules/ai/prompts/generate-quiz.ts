import type { QuizModelInput } from "../model-gateway";
import { projectDeveloperContext } from "../../profiles/developer-context";
import { RESEARCH_TOOL_POLICY, SHARED_INSTRUCTIONS, type Prompt } from "./core";

export const QUIZ_PROMPT_VERSION = "quiz-v8";

const QUIZ_RULES = `# Quiz generation
Assess the engineer's understanding of the requested subject or saved challenge. Follow the app's question count, difficulty, and coverage. Honor the requested language, emphasis, and exclusions. Use relevant experience to calibrate prerequisites without assuming mastery.

Write clear, independent questions about useful concepts, behavior, failure cases, or engineering decisions. Include small code examples and runtime assumptions when they help make the answer determinate. Use fresh reasoning and examples, including when prior questions are supplied. Avoid trivia and trick wording.

Calibrate the reasoning to the selected difficulty. Easy covers fundamentals. Medium applies them with one meaningful complication. Hard combines constraints or tradeoffs. Grill asks for demanding reasoning about subtle interactions within the topic.

Give each question four distinct, plausible options and exactly one correct answer under the stated assumptions. Use similar wording and specificity across choices. Avoid giveaways and vary the correct option's position. Give a brief technical explanation for the answer, shown after submission.

Check correctness, ambiguity, repetition, coverage, and answer leakage. Return the quiz through the supplied output contract. Use a specific title of 2–6 words, up to 72 characters, and a zero-based correctOption for each question.`;

const CHALLENGE_COVERAGE = {
  challenge: "Assess the saved challenge's required behavior and constraints.",
  related: "Assess closely related concepts using independent examples.",
  mixed:
    "Cover both the saved challenge's behavior and closely related concepts.",
} as const;

export function quizPrompt(input: QuizModelInput): Prompt {
  const { challenge } = input;
  if (!challenge) {
    return {
      instructions: [
        SHARED_INSTRUCTIONS,
        QUIZ_RULES,
        RESEARCH_TOOL_POLICY,
        `# Standalone quiz
Use the engineer's request as the subject. A short topic is sufficient. Choose useful coverage within it and preserve each subject and constraint in a detailed request.`,
      ].join("\n\n"),
      input: JSON.stringify({
        promptVersion: QUIZ_PROMPT_VERSION,
        developerContext: projectDeveloperContext(
          input.preferences,
          input.prompt,
        ),
        previousQuestions: input.previousQuestions,
        selectedDifficulty: input.difficulty,
        questionCount: input.questionCount,
        currentRequest: input.prompt,
      }),
    };
  }
  return {
    instructions: [
      SHARED_INSTRUCTIONS,
      QUIZ_RULES,
      RESEARCH_TOOL_POLICY,
      `# Challenge quiz
Use the frozen challenge and its developer context. ${CHALLENGE_COVERAGE[input.coverage]}
Keep the saved requirements intact. Avoid revealing the implementation, core algorithm, hidden defect, or sequence of steps in questions, options, or explanations. Use independent examples when code reading is useful.`,
    ].join("\n\n"),
    input: JSON.stringify({
      promptVersion: QUIZ_PROMPT_VERSION,
      developerContext: challenge.contextSnapshot?.developerContext ?? null,
      challenge: {
        title: challenge.title,
        topic: challenge.topic,
        scope: challenge.scope,
        difficulty: challenge.difficulty,
        problemStatement: challenge.problemStatement,
        completionCriteria: challenge.completionCriteria,
        implementationBoundary: challenge.implementationBoundary,
      },
      previousQuestions: input.previousQuestions,
      selectedDifficulty: challenge.difficulty,
      questionCount: input.questionCount,
      coverage: input.coverage,
    }),
  };
}
