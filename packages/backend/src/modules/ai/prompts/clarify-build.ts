import type { Challenge } from "../../challenges/challenge.schema";
import type { ChatMessage } from "../../messages/message.schema";
import type { LearnerContext } from "../model-gateway";
import {
  CORE_INSTRUCTIONS,
  conversationPromptContext,
  type Prompt,
} from "./core";

export function clarificationPrompt(input: {
  challenge: Challenge;
  messages: ChatMessage[];
  content: string;
  learner: LearnerContext;
}): Prompt {
  return {
    instructions:
      CORE_INSTRUCTIONS +
      "\n\nAnswer only about the current build. Clarify requirements without changing them, teaching ahead of an attempt, or revealing the solution. Preserve every completion criterion.",
    input:
      conversationPromptContext(input) +
      "\n\nUSER QUESTION\n" +
      JSON.stringify(input.content),
  };
}
