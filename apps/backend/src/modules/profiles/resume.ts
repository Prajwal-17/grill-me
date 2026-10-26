import { AppError } from "../../shared/errors/app-error";
import type { ModelGateway } from "../ai/model-gateway";
import { validateResumeExtraction } from "./resume.schema";

export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
export const RESUME_DEADLINE_MS = 20_000;
const errors: Record<string, string> = {
  RESUME_TOO_MANY_PAGES:
    "PDFs must contain at most 30 pages. Paste a shorter resume as text instead.",
  RESUME_UNREADABLE_PDF:
    "This PDF has no readable resume text. Scanned PDFs need OCR before import; paste the text instead.",
  RESUME_ENCRYPTED:
    "Encrypted or password-protected documents cannot be imported. Paste the resume text instead.",
  RESUME_MALFORMED:
    "This document could not be read. Choose a valid PDF or DOCX, or paste the resume text instead.",
};
export function validateResumeText(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 40 || trimmed.length > 100_000)
    throw new AppError(
      "RESUME_TEXT_LENGTH",
      "Resume text must contain between 40 and 100,000 characters. Paste a shorter professional summary if needed.",
      400,
    );
  return trimmed;
}

export function extractResumeDocument(
  format: "pdf" | "docx",
  bytes: ArrayBuffer,
  signal?: AbortSignal,
  options: { deadlineMs?: number; workerUrl?: URL } = {},
): Promise<{ text: string; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      options.workerUrl ?? new URL("./resume.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (
      error?: Error,
      result?: { text: string; warnings: string[] },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () =>
      finish(
        new AppError("RESUME_CANCELLED", "Resume import was cancelled.", 499),
      );
    const deadline = setTimeout(
      () =>
        finish(
          new AppError(
            "RESUME_EXTRACTION_TIMEOUT",
            "Document extraction exceeded 20 seconds. Try a smaller document or paste the text instead.",
            408,
            true,
          ),
        ),
      options.deadlineMs ?? RESUME_DEADLINE_MS,
    );
    worker.onmessage = (
      event: MessageEvent<{ error?: string; text: string; warnings: string[] }>,
    ) => {
      if (event.data.error)
        finish(
          new AppError(
            event.data.error,
            errors[event.data.error] ?? errors.RESUME_MALFORMED!,
            400,
          ),
        );
      else {
        try {
          finish(undefined, {
            text: validateResumeText(event.data.text),
            warnings: event.data.warnings,
          });
        } catch (error) {
          finish(error as Error);
        }
      }
    };
    worker.onerror = () =>
      finish(new AppError("RESUME_MALFORMED", errors.RESUME_MALFORMED!, 400));
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    else worker.postMessage({ format, bytes }, [bytes]);
  });
}

// Only this endpoint receives these body limits; submission uploads are unchanged.
async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(
      "RESUME_INPUT_REQUIRED",
      "Choose a PDF or DOCX, or paste resume text.",
      400,
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel();
  };
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (request.signal.aborted)
        throw new AppError(
          "RESUME_CANCELLED",
          "Resume import was cancelled.",
          499,
        );
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max)
        throw new AppError(
          "RESUME_TOO_LARGE",
          "Resume files must be at most 10 MiB; pasted text must be at most 100,000 characters.",
          413,
        );
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    request.signal.removeEventListener("abort", cancel);
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function previewResume(
  request: Request,
  profileId: string,
  llm: ModelGateway,
) {
  const type = request.headers.get("content-type") ?? "";
  const mediaType = type.split(";")[0]?.trim().toLowerCase();
  let text: string;
  let warnings: string[] = [];
  if (mediaType === "application/json") {
    const bytes = await boundedBody(request, 600_000);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new AppError(
        "INVALID_JSON",
        "Provide resume text as JSON { text }.",
        400,
      );
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("text" in body) ||
      typeof body.text !== "string"
    )
      throw new AppError(
        "RESUME_INPUT_REQUIRED",
        "Provide resume text as JSON { text }.",
        400,
      );
    text = validateResumeText(body.text);
  } else if (mediaType === "multipart/form-data") {
    const bytes = await boundedBody(request, RESUME_MAX_BYTES + 64 * 1024);
    let data: FormData;
    try {
      data = await new Response(bytes, {
        headers: { "Content-Type": type },
      }).formData();
    } catch {
      throw new AppError(
        "RESUME_MALFORMED",
        "The upload is malformed. Choose a file again or paste its text.",
        400,
      );
    }
    const file = data.get("file");
    if (!(file instanceof File) || data.getAll("file").length !== 1)
      throw new AppError(
        "RESUME_INPUT_REQUIRED",
        "Choose one PDF or DOCX file.",
        400,
      );
    if (file.size > RESUME_MAX_BYTES)
      throw new AppError(
        "RESUME_TOO_LARGE",
        "Resume files must be at most 10 MiB.",
        413,
      );
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "pdf" && extension !== "docx")
      throw new AppError(
        "RESUME_UNSUPPORTED_FORMAT",
        "Choose a PDF or DOCX, or paste resume text. Other file formats are not supported.",
        415,
      );
    const binary = await file.arrayBuffer();
    const head = new Uint8Array(binary, 0, Math.min(binary.byteLength, 8));
    const compoundFile = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (byte, index) => head[index] === byte,
    );
    if (
      extension === "docx" &&
      (compoundFile ||
        (head[0] === 0x50 && head[1] === 0x4b && Boolean(head[6]! & 1)))
    )
      throw new AppError("RESUME_ENCRYPTED", errors.RESUME_ENCRYPTED!, 400);
    if (
      extension === "pdf"
        ? new TextDecoder().decode(head.subarray(0, 5)) !== "%PDF-"
        : head[0] !== 0x50 || head[1] !== 0x4b
    )
      throw new AppError("RESUME_MALFORMED", errors.RESUME_MALFORMED!, 400);
    ({ text, warnings } = await extractResumeDocument(
      extension,
      binary,
      request.signal,
    ));
  } else
    throw new AppError(
      "RESUME_UNSUPPORTED_FORMAT",
      "Choose a PDF or DOCX, or paste resume text.",
      415,
    );
  if (request.signal.aborted)
    throw new AppError("RESUME_CANCELLED", "Resume import was cancelled.", 499);
  if (!llm.extractResume)
    throw new AppError(
      "MODEL_NOT_CONFIGURED",
      "Resume import is unavailable. Enter your developer profile manually.",
      503,
    );
  const raw = await llm.extractResume({
    profileId,
    text,
    signal: request.signal,
  });
  if (request.signal.aborted)
    throw new AppError("RESUME_CANCELLED", "Resume import was cancelled.", 499);
  const result = validateResumeExtraction(raw, text);
  return { draft: result.draft, warnings: [...warnings, ...result.warnings] };
}
