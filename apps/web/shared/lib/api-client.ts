import type { ApiError } from "../types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function requestHeaders(init: RequestInit, profileId?: string) {
  return {
    "Content-Type": "application/json",
    ...(profileId ? { "X-Profile-Id": profileId } : {}),
    ...init.headers,
  };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  profileId?: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: requestHeaders(init, profileId),
  });
  const body = (await response.json()) as { data?: T } | ApiError;

  if (!response.ok || "error" in body) {
    const error =
      "error" in body
        ? body.error
        : {
            code: "INVALID_RESPONSE",
            message: "The API returned an unexpected response.",
            retryable: false,
          };
    throw new ApiClientError(error.message, error.code, error.retryable);
  }

  return body.data as T;
}

type StreamEvent<T> =
  | { type: "delta"; delta: string }
  | { type: "done"; data: T }
  | { type: "error"; error: ApiError["error"] };

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      typeof requestAnimationFrame === "function"
    ) {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

export async function streamRequest<T>(
  path: string,
  init: RequestInit,
  profileId: string,
  onDelta: (delta: string) => void,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...requestHeaders(init, profileId),
      Accept: "application/x-ndjson",
    },
  });

  if (!response.ok) {
    const body = (await response.json()) as ApiError;
    throw new ApiClientError(
      body.error.message,
      body.error.code,
      body.error.retryable,
    );
  }
  if (!response.body) {
    throw new ApiClientError(
      "The API returned an empty stream.",
      "EMPTY_STREAM",
      true,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: T | undefined;

  const consumeLine = async (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent<T>;

    if (event.type === "delta") {
      onDelta(event.delta);
      await waitForNextPaint();
    }
    if (event.type === "done") completed = event.data;
    if (event.type === "error") {
      throw new ApiClientError(
        event.error.message,
        event.error.code,
        event.error.retryable,
      );
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) await consumeLine(line);
    if (done) break;
  }

  await consumeLine(buffer);
  if (completed === undefined) {
    throw new ApiClientError(
      "The stream ended before the response completed.",
      "INCOMPLETE_STREAM",
      true,
    );
  }
  return completed;
}
