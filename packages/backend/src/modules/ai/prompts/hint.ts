import type { Challenge } from "../../challenges/challenge.schema";
import type { ChatMessage } from "../../messages/message.schema";
import type { LearnerContext } from "../model-gateway";
import {
  CORE_INSTRUCTIONS,
  conversationPromptContext,
  type Prompt,
} from "./core";

export function hintPrompt(input: {
  helpKind?: "hint" | "approach";
  challenge: Challenge;
  messages: ChatMessage[];
  learner: LearnerContext;
}): Prompt {
  return {
    instructions:
      CORE_INSTRUCTIONS +
      "\n\nGive the next smallest useful hint, under 80 words. Use prior hints: first point to an overlooked behavior, then name a relevant concept, then offer only a high-level approach. Do not assemble a complete solution across successive hints. Do not change the original criteria.",
    input:
      conversationPromptContext(input) +
      "\nRequested help: " +
      (input.helpKind === "approach"
        ? "Give a high-level approach, leaving the key reasoning and implementation to the learner."
        : "Give the next smallest useful hint."),
  };
}
