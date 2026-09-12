import { logModel, type LogInsert } from "./log.model";
import type { LogOperation } from "./log.schema";

export type LogContext = {
  profileId: string;
  challengeId?: string;
  operation: LogOperation;
  preview: string;
};
const SECRET_KEY =
  /^(authorization|proxy-authorization|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie|set-cookie)$/i;

export function redactLogValue<T>(value: T, secret?: string): T {
  const serialized = JSON.stringify(value, (key, item: unknown) => {
    if (SECRET_KEY.test(key)) return "[REDACTED]";
    if (typeof item === "string" && secret)
      return item.split(secret).join("[REDACTED]");
    return item;
  });
  return serialized === undefined ? value : (JSON.parse(serialized) as T);
}

function safeEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return "Configured model endpoint";
  }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function tokenCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function startAiLog(
  context: LogContext,
  request: Record<string, unknown>,
  endpoint: string,
  secret?: string,
) {
  const id = crypto.randomUUID();
  const started = performance.now();
  let persisted = false;
  let finished = false;
  let firstTokenMs: number | null = null;
  let response: Record<string, unknown> | null = null;
  let responseText = "";
  const events: unknown[] = [];
  function safe<T>(value: T) {
    return redactLogValue(value, secret);
  }
  try {
    logModel.start({
      id,
      ...context,
      challengeId: context.challengeId ?? null,
      status: "running",
      requestedModel: safe(String(request.model)),
      endpoint: safe(safeEndpoint(endpoint)),
      streamed: request.stream === true,
      preview: safe(context.preview).slice(0, 240),
      requestBody: safe(request),
      startedAt: new Date(),
    });
    persisted = true;
  } catch {
    console.warn(
      "[ai-log] Could not save request log; model request will continue.",
    );
  }

  return {
    response(value: unknown) {
      response = object(value);
      if (typeof response.output_text === "string")
        responseText = response.output_text;
    },
    event(value: unknown) {
      events.push(value);
      const event = object(value);
      if (event.response) response = object(event.response);
    },
    delta(value: string) {
      firstTokenMs ??= Math.round(performance.now() - started);
      responseText += value;
    },
    finish(status: "success" | "error" | "cancelled", error?: unknown) {
      if (finished) return;
      finished = true;
      if (!persisted) return;
      const usage = object(response?.usage);
      const details = object(error);
      const failure = error
        ? {
            name: error instanceof Error ? error.name : "ProviderError",
            message:
              error instanceof Error
                ? error.message
                : String(details.message ?? error),
            code: details.code ?? null,
            status: details.status ?? details.statusCode ?? null,
            retryable: details.retryable ?? null,
            providerError: details.error ?? null,
          }
        : null;
      const cost = usage.cost ?? response?.cost;
      const update: Partial<LogInsert> = {
        status,
        completedAt: new Date(),
        durationMs: Math.round(performance.now() - started),
        firstTokenMs,
        actualModel:
          typeof response?.model === "string" ? response.model : null,
        providerRequestId:
          typeof response?.id === "string"
            ? response.id
            : typeof details.requestID === "string"
              ? details.requestID
              : null,
        inputTokens: tokenCount(usage.input_tokens),
        outputTokens: tokenCount(usage.output_tokens),
        totalTokens: tokenCount(usage.total_tokens),
        cachedTokens: tokenCount(
          object(usage.input_tokens_details).cached_tokens,
        ),
        reasoningTokens: tokenCount(
          object(usage.output_tokens_details).reasoning_tokens,
        ),
        costUsd:
          typeof cost === "number" && Number.isFinite(cost) && cost >= 0
            ? cost
            : null,
        responseBody: response,
        responseText,
        streamEvents: request.stream === true ? events : null,
        error: failure,
      };
      try {
        // Keep the database Date object; payload redaction serializes JSON values.
        logModel.finish(id, {
          ...safe(update),
          completedAt: update.completedAt,
        });
      } catch {
        console.warn(
          "[ai-log] Could not finish request log; model result is unchanged.",
        );
      }
    },
  };
}
