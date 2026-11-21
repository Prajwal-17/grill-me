import type { MessageAttachment } from "@/shared/types/api";

const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Inline text cap per file; larger text files go through server extraction. */
export const MAX_INLINE_GENERATION_BYTES = 256 * 1024;
/** Attached images ride inline as base64 image blocks. */
export const MAX_GENERATION_IMAGE_BYTES = 512 * 1024;
/** Upload cap for documents and oversized text sent to server extraction. */
export const MAX_UPLOAD_GENERATION_BYTES = 10 * 1024 * 1024;
/** Combined budget so the generation request stays within the local transport. */
export const MAX_GENERATION_TOTAL_BYTES = 700 * 1024;
export const MAX_GENERATION_ATTACHMENTS = 5;

export function attachmentBytes(attachments: MessageAttachment[]) {
  return attachments.reduce(
    (total, attachment) =>
      total +
      new TextEncoder().encode(attachment.text).byteLength +
      (attachment.data ? Math.ceil((attachment.data.length * 3) / 4) : 0),
    0,
  );
}

/**
 * Every file is pickable; content decides. Text files attach inline, images
 * attach as image data, and documents (PDF, DOCX) plus oversized text files
 * are extracted to bounded text by the backend upload endpoint.
 */
export const ATTACHMENT_ACCEPT: string | undefined = undefined;

async function inlineImage(file: File): Promise<MessageAttachment> {
  if (file.size > MAX_GENERATION_IMAGE_BYTES)
    throw new Error(
      `${file.name} is larger than the ${formatBytes(MAX_GENERATION_IMAGE_BYTES)} image limit.`,
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return {
    filename: file.name,
    text: "",
    mimeType: imageTypes[file.name.split(".").pop()!.toLowerCase()]!,
    data: btoa(binary),
  };
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MiB`;
  return `${Math.round(bytes / 1024)} KiB`;
}

/**
 * Read attachments for generation context. Any file type is accepted: images
 * become image blocks, documents and oversized text are extracted server-side
 * to bounded text, and binary files are rejected with a clear message.
 */
export async function readGenerationAttachments(
  files: File[],
  existing: MessageAttachment[],
  extractDocument?: (file: File) => Promise<MessageAttachment>,
) {
  const next: MessageAttachment[] = [];
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (extension in imageTypes) {
      next.push(await inlineImage(file));
      continue;
    }
    if (file.size > MAX_UPLOAD_GENERATION_BYTES)
      throw new Error(
        `${file.name} is larger than the ${formatBytes(MAX_UPLOAD_GENERATION_BYTES)} attachment limit.`,
      );
    const document = extension === "pdf" || extension === "docx";
    if (document || file.size > MAX_INLINE_GENERATION_BYTES) {
      if (!extractDocument)
        throw new Error(
          document
            ? `${file.name} needs document extraction, which is unavailable right now.`
            : `${file.name} is larger than the inline ${formatBytes(MAX_INLINE_GENERATION_BYTES)} limit.`,
        );
      next.push(await extractDocument(file));
      continue;
    }
    const fileText = await file.text();
    if (fileText.includes("\0"))
      throw new Error(
        `${file.name} appears to be a binary file. Attach documents, images, or text instead.`,
      );
    next.push({ filename: file.name, text: fileText });
  }

  const combined = [...existing, ...next];
  if (combined.length > MAX_GENERATION_ATTACHMENTS)
    throw new Error(
      `Attach up to ${MAX_GENERATION_ATTACHMENTS} files. Remove one first.`,
    );
  const total = attachmentBytes(combined);
  if (total > MAX_GENERATION_TOTAL_BYTES)
    throw new Error(
      `Attached files total more than the ${formatBytes(MAX_GENERATION_TOTAL_BYTES)} limit. Remove or shrink one.`,
    );
  return combined;
}
