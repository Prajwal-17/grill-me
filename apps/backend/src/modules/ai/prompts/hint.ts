import type { Challenge } from "../../challenges/challenge.schema";
import type { ChatMessage } from "../../messages/message.schema";
import type { LearnerContext } from "../model-gateway";
import {
  CORE_INSTRUCTIONS,
  conversationPromptContext,
  type Prompt,
} from "./core";

export function hintPrompt(input: {
  challenge: Challenge;
  messages: ChatMessage[];
  learner: LearnerContext;
}): Prompt {
  return {
    instructions:
      CORE_INSTRUCTIONS +
      "\n\nGive exactly one useful conceptual hint for the current build, under 120 words. Address the current obstacle without changing criteria or providing a complete solution.",
    input: conversationPromptContext(input),
  };
}
