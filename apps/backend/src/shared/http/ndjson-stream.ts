import type { Context } from "hono";
import { stream } from "hono/streaming";
import { AppError } from "../errors/app-error";

type StreamOperation<T> = (
  onDelta: (delta: string) => Promise<void>,
) => Promise<T>;

export function streamNdjson<T>(c: Context, operation: StreamOperation<T>) {
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (output) => {
    try {
      const data = await operation(async (delta) => {
        await output.write(`${JSON.stringify({ type: "delta", delta })}\n`);
      });
      await output.write(`${JSON.stringify({ type: "done", data })}\n`);
    } catch (error) {
      const known = error instanceof AppError;
      await output.write(
        `${JSON.stringify({
          type: "error",
          error: {
            code: known ? error.code : "MODEL_UNAVAILABLE",
            message: known
              ? error.message
              : "The model service is unavailable. Try again.",
            retryable: known ? error.retryable : true,
          },
        })}\n`,
      );
    }
  });
}
