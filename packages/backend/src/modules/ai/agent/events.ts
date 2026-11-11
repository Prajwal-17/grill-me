import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentRunEvent } from "@repo/backend/shared/contracts";

const SECRET_KEY =
  /^(authorization|proxy-authorization|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie|set-cookie|token)$/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const API_KEY = /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g;

function redactString(value: string) {
  return value
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(API_KEY, "[REDACTED]");
}

export function boundedValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return redactString(value.slice(0, 8_000));
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (value === undefined) return undefined;
  if (Array.isArray(value))
    return value.slice(0, 50).map((entry) => boundedValue(entry, depth + 1));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEY.test(key))
      .slice(0, 50)
      .map(([key, entry]) => [key, boundedValue(entry, depth + 1)]);
    return Object.fromEntries(entries);
  }
  return String(value);
}

function safeMessage(message: AgentMessage) {
  if (message.role === "assistant") {
    return {
      role: message.role,
      api: message.api,
      provider: message.provider,
      model: message.model,
      stopReason: message.stopReason,
      errorMessage: message.errorMessage
        ? redactString(message.errorMessage.slice(0, 2_000))
        : undefined,
      usage: {
        input: message.usage.input,
        output: message.usage.output,
        cacheRead: message.usage.cacheRead,
        cacheWrite: message.usage.cacheWrite,
        totalTokens: message.usage.totalTokens,
      },
      content: message.content.flatMap((block): object[] => {
        if (block.type === "thinking") return [];
        if (block.type === "text")
          return [
            { type: "text", text: redactString(block.text.slice(0, 8_000)) },
          ];
        return [
          {
            type: "toolCall",
            id: block.id,
            name: block.name,
            arguments: boundedValue(block.arguments),
          },
        ];
      }),
      timestamp: message.timestamp,
    };
  }
  if (message.role === "toolResult") {
    return {
      role: message.role,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      content: message.content.map((block) =>
        block.type === "text"
          ? { type: "text", text: redactString(block.text.slice(0, 8_000)) }
          : { type: "image", mimeType: block.mimeType },
      ),
      timestamp: message.timestamp,
    };
  }
  if (message.role === "user") {
    return {
      role: message.role,
      content:
        typeof message.content === "string"
          ? redactString(message.content.slice(0, 8_000))
          : message.content.map((block) =>
              block.type === "text"
                ? {
                    type: "text",
                    text: redactString(block.text.slice(0, 8_000)),
                  }
                : { type: "image", mimeType: block.mimeType },
            ),
      timestamp: message.timestamp,
    };
  }
  return boundedValue(message);
}

export type StableAgentEvent = AgentRunEvent;

export function stableEvent(
  event: AgentEvent,
  limits: { textChars: { value: number } },
): StableAgentEvent | null {
  switch (event.type) {
    case "turn_start":
      return { type: "turn_started", turn: 0 };
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        const remaining = 32_000 - limits.textChars.value;
        if (remaining <= 0) return null;
        const text = event.assistantMessageEvent.delta.slice(0, remaining);
        limits.textChars.value += text.length;
        return { type: "text_delta", text };
      }
      return null;
    case "message_end":
      return {
        type: "message_completed",
        message: safeMessage(event.message),
      };
    case "tool_execution_start":
      return {
        type: "tool_started",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: boundedValue(event.args),
      };
    case "tool_execution_end":
      return {
        type: "tool_finished",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
        durationMs: event.durationMs,
        result: boundedValue(event.result),
      };
    default:
      return null;
  }
}
