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
    .map((message) => {
      const files = message.attachments.length
        ? `\n[Attached files: ${message.attachments.map((file) => file.filename).join(", ")}]`
        : "";
      return `${message.role.toUpperCase()}: ${message.content}${files}`;
    })
    .join("\n\n");
}

export function parseJson(text: string) {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(clean) as unknown;
  } catch {
    /* Accept a single wrapped object without repairing its contents. */
  }
  const candidates: unknown[] = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (start < 0) {
      if (char === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      candidates.push(JSON.parse(clean.slice(start, i + 1)));
      start = -1;
    }
  }
  if (candidates.length !== 1 || start !== -1)
    throw new Error("Expected one JSON object");
  return candidates[0];
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
