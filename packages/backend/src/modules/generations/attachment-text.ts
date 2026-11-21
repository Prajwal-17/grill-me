import { AppError } from "../../shared/errors/app-error";
import { extractDocumentText } from "../profiles/resume";

/** Uploaded attachment documents may be at most this large before extraction. */
export const GENERATION_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Extracted text is bounded so one document cannot flood the request. */
const MAX_EXTRACTED_CHARS = 200_000;

/** Multipart body cap: the file plus form overhead. */
const UPLOAD_BODY_SLACK = 64 * 1024;

/** Read one uploaded attachment file from a multipart request. */
export async function readAttachmentUpload(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data"))
    throw new AppError(
      "GENERATION_ATTACHMENT_INPUT_REQUIRED",
      "Choose a file to attach.",
      400,
    );
  const bytes = await boundedBody(
    request,
    GENERATION_ATTACHMENT_MAX_BYTES + UPLOAD_BODY_SLACK,
  );
  let data: FormData;
  try {
    data = await new Response(bytes, {
      headers: { "Content-Type": type },
    }).formData();
  } catch {
    throw new AppError(
      "GENERATION_ATTACHMENT_MALFORMED",
      "The upload is malformed. Choose the file again.",
      400,
    );
  }
  const file = data.get("file");
  if (!(file instanceof File) || data.getAll("file").length !== 1)
    throw new AppError(
      "GENERATION_ATTACHMENT_INPUT_REQUIRED",
      "Choose one file to attach.",
      400,
    );
  if (file.size > GENERATION_ATTACHMENT_MAX_BYTES)
    throw new AppError(
      "GENERATION_ATTACHMENT_TOO_LARGE",
      "Attachments must be at most 10 MiB.",
      413,
    );
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(
      "GENERATION_ATTACHMENT_INPUT_REQUIRED",
      "Choose a file to attach.",
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
          "REQUEST_CANCELLED",
          "The request was cancelled.",
          499,
        );
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max)
        throw new AppError(
          "GENERATION_ATTACHMENT_TOO_LARGE",
          "Attachments must be at most 10 MiB.",
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

const errorMessages: Record<string, string> = {
  RESUME_TOO_MANY_PAGES:
    "This PDF could not be read within the extraction deadline. Try a smaller document or paste the text instead.",
  RESUME_UNREADABLE_PDF:
    "This PDF has no readable text. Scanned PDFs need OCR; paste the text into the prompt instead.",
  RESUME_ENCRYPTED:
    "Encrypted or password-protected documents cannot be read. Paste the text instead.",
  RESUME_MALFORMED:
    "This document could not be read. Try the file again, or paste its text into the prompt instead.",
  RESUME_EXTRACTION_TIMEOUT:
    "Document extraction exceeded 20 seconds. Try a smaller document or paste the text instead.",
};

function pdfHeader(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"
  );
}

function docxHeader(bytes: Uint8Array) {
  // DOCX is a ZIP container; encrypted ZIPs set a flag in the header, and the
  // compound header belongs to legacy binary DOC files.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const encrypted = Boolean((bytes[6] ?? 0) & 1);
  const compound =
    bytes.length >= 8 &&
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (byte, index) => bytes[index] === byte,
    );
  return (zip && !encrypted) || compound;
}

/**
 * Turn one uploaded attachment file into bounded prompt text. PDFs and DOCX
 * files are parsed in the shared extraction worker; every other file is read
 * as UTF-8 text, and binary content is rejected instead of guessed at.
 */
export async function extractAttachmentText(
  filename: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<{ filename: string; text: string }> {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  let text: string;
  if (extension === "pdf" || pdfHeader(bytes)) {
    if (!pdfHeader(bytes))
      throw new AppError(
        "GENERATION_ATTACHMENT_MALFORMED",
        `${filename} is not a readable PDF document.`,
        400,
      );
    text = await documentText("pdf", bytes, signal);
  } else if (extension === "docx" || docxHeader(bytes)) {
    if (extension !== "docx" && !docxHeader(bytes))
      throw new AppError(
        "GENERATION_ATTACHMENT_MALFORMED",
        `${filename} is not a readable DOCX document.`,
        400,
      );
    text = await documentText("docx", bytes, signal);
  } else {
    text = new TextDecoder().decode(bytes);
    if (text.includes("\0"))
      throw new AppError(
        "GENERATION_ATTACHMENT_BINARY",
        `${filename} appears to be a binary file. Attach documents, images, or text instead.`,
        415,
      );
  }
  text = text.trim();
  if (text.length > MAX_EXTRACTED_CHARS)
    text = `${text.slice(0, MAX_EXTRACTED_CHARS)}\n… truncated`;
  return { filename, text: text || "(empty file)" };
}

async function documentText(
  format: "pdf" | "docx",
  bytes: Uint8Array,
  signal?: AbortSignal,
) {
  // The worker transfers the buffer away, so hand it a copy of the request
  // bytes. No page cap and no minimum length: challenge context documents
  // differ from resumes, and the prompt layer bounds whatever is extracted.
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  try {
    const result = await extractDocumentText(format, copy, signal, {
      maxPages: 0,
      minChars: 1,
    });
    return result.text;
  } catch (error) {
    if (error instanceof AppError && errorMessages[error.code])
      throw new AppError(error.code, errorMessages[error.code]!, 400);
    throw error;
  }
}
