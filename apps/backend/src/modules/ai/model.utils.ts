import { AppError } from "../../shared/errors/app-error";

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
