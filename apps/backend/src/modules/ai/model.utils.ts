import { AppError } from "../../shared/errors/app-error";
import type { Challenge } from "../challenges/challenge.schema";
import type { ChatMessage } from "../messages/message.schema";

export function challengeContext(challenge: Challenge) {
  return JSON.stringify({
    title: challenge.title,
    type: challenge.type,
    problemStatement: challenge.problemStatement,
    expectedOutcome: challenge.expectedOutcome,
    constraints: challenge.constraints,
    starterCode: challenge.starterCode,
    completionCriteria: challenge.completionCriteria,
    hint: challenge.hint,
  });
}

export function transcript(messages: ChatMessage[]) {
  return messages
    .slice(-20)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
}

export function parseJson(text: string) {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(clean) as unknown;
}

export function modelUnavailable(error: unknown): never {
  if (error instanceof AppError) throw error;
  throw new AppError(
    "MODEL_UNAVAILABLE",
    "The model service is unavailable. Try again.",
    503,
    true,
  );
}
