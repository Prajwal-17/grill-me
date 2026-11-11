import type { JudgeInput, LearnerContext } from "../../model-gateway";
import type {
  ChatMessage,
  MessageAttachment,
} from "../../../messages/message.schema";
import { clarificationPrompt } from "../../prompts/clarify-build";
import { reviewPrompt } from "../../prompts/review-build";
import { hintPrompt } from "../../prompts/hint";
import { contextBlock } from "../messages";
import { conversationContext, technicalContext } from "./context";
import type { TextTask } from "./types";

export function conversationTask(input: {
  mode: "clarify" | "review";
  challenge: JudgeInput["challenge"];
  messages: ChatMessage[];
  content: string;
  attachments: MessageAttachment[];
  learner: LearnerContext;
}): TextTask {
  const prompt =
    input.mode === "review" ? reviewPrompt(input) : clarificationPrompt(input);
  return {
    operation: input.mode,
    instructions: prompt.instructions,
    context: [
      conversationContext(input),
      contextBlock(
        "learner_context",
        technicalContext(input.learner, input.content),
        { untrusted: false },
      ),
    ].join("\n\n"),
    userText: input.content,
    attachments: input.attachments,
  };
}

export function hintTask(input: {
  helpKind?: "hint" | "approach";
  challenge: JudgeInput["challenge"];
  messages: ChatMessage[];
  learner: LearnerContext;
}): TextTask {
  const prompt = hintPrompt(input);
  return {
    operation: "hint",
    instructions: prompt.instructions,
    context: [
      conversationContext(input),
      contextBlock(
        "learner_context",
        technicalContext(input.learner, input.challenge.title),
        { untrusted: false },
      ),
      contextBlock("requested_help", input.helpKind ?? "hint", {
        untrusted: false,
      }),
    ].join("\n\n"),
    userText:
      input.helpKind === "approach"
        ? "Give me a high-level approach."
        : "Give me the next smallest useful hint.",
  };
}
