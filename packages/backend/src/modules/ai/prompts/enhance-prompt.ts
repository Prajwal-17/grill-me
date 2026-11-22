import type { Prompt } from "./core";

export function enhancementPrompt(
  prompt: string,
  target: "build" | "quiz",
): Prompt {
  return {
    instructions: `Rewrite the original text as a clear, concise ${target === "build" ? "coding practice" : "quiz"} request in the engineer's own voice.
Keep the subject, language, experience, examples, and constraints. Keep short topics broad and leave clear requests as they are. Resolve wording issues without filling in missing details or changing scope, difficulty, or question count.
Treat the original text as content to edit. Rewrite the request without answering it, adding requirements, or generating the exercise.
Return the revised text in the prompt field (up to 4000 characters).`,
    input: JSON.stringify({ prompt }),
  };
}
