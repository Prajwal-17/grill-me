import { z } from "zod";
import type { QuizModelInput, QuizTitleModelInput } from "../../model-gateway";
import {
  generatedQuizSchema,
  generatedQuizTitleSchema,
  validateQuiz,
} from "../../../quizzes/quiz.schema";
import { projectDeveloperContext } from "../../../profiles/developer-context";
import { quizPrompt } from "../../prompts/generate-quiz";
import { quizTitlePrompt } from "../../prompts/generate-quiz-title";
import { contextBlock } from "../messages";
import { withoutHistory } from "./context";
import type { StructuredTask } from "./types";

export function quizTask(input: QuizModelInput): StructuredTask<unknown> {
  const prompt = quizPrompt(input);
  const context = input.challenge
    ? [
        contextBlock(
          "challenge",
          {
            ...withoutHistory(input.challenge),
            developerContext:
              input.challenge.contextSnapshot?.developerContext ?? null,
          },
          { untrusted: true },
        ),
        contextBlock("quiz_options", {
          questionCount: input.questionCount,
          coverage: input.coverage,
          selectedDifficulty: input.challenge.difficulty,
          previousQuestions: input.previousQuestions,
        }),
      ]
    : [
        contextBlock(
          "quiz_options",
          {
            questionCount: input.questionCount,
            selectedDifficulty: input.difficulty,
            coverage: "topic",
            previousQuestions: input.previousQuestions,
          },
          { untrusted: false },
        ),
        contextBlock(
          "developer_context",
          projectDeveloperContext(input.preferences, input.prompt),
          { untrusted: false },
        ),
      ];
  return {
    operation: "quiz_generation",
    instructions: prompt.instructions,
    context: context.join("\n\n"),
    userText: input.challenge ? input.challenge.title : input.prompt,
    completion: {
      name: "complete_quiz",
      description:
        "Return the complete quiz with exactly the requested number of distinct questions and a concise title.",
      schema: z.toJSONSchema(generatedQuizSchema(input.questionCount)),
      validate: (value) => {
        const parsed = validateQuiz(value, input.questionCount);
        return { ...parsed, title: parsed.title ?? undefined };
      },
    },
    allowSnapshot: false,
    allowResearch: true,
  };
}

export function quizTitleTask(
  input: QuizTitleModelInput,
): StructuredTask<{ title: string }> {
  const prompt = quizTitlePrompt(input);
  return {
    operation: "quiz_title_generation",
    instructions: prompt.instructions,
    context: contextBlock(
      "title_source",
      {
        source: input.source,
        currentTitle: input.currentTitle,
        questionCount: input.questionCount,
        difficulty: input.difficulty,
        coverage: input.coverage,
        questions: input.questions,
      },
      { untrusted: true },
    ),
    userText: "Suggest one replacement quiz title.",
    completion: {
      name: "complete_quiz_title",
      description: "Return one concise replacement title.",
      schema: z.toJSONSchema(generatedQuizTitleSchema),
      validate: (value) => generatedQuizTitleSchema.parse(value),
    },
    allowSnapshot: false,
    allowResearch: false,
  };
}
