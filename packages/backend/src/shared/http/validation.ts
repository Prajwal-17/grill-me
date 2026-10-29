import { z, type ZodType } from "zod";
import { AppError } from "../errors/app-error";

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      z.prettifyError(result.error),
      400,
      false,
    );
  }

  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "The request body must be valid JSON.",
      400,
      false,
    );
  }
}
