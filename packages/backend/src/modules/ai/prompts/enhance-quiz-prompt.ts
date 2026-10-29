import { enhancementPrompt } from "./enhance-prompt";

export function enhanceQuizPromptPrompt(prompt: string) {
  return enhancementPrompt(prompt, "quiz");
}
