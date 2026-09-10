import type { MessageAttachment } from "../../../shared/types/api";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 100 * 1024;

const acceptedExtensions = new Set([
  "asm",
  "bash",
  "c",
  "cc",
  "cfg",
  "clj",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "dart",
  "ex",
  "exs",
  "fs",
  "fsx",
  "go",
  "graphql",
  "groovy",
  "h",
  "hpp",
  "hs",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "kts",
  "lua",
  "md",
  "mjs",
  "php",
  "pl",
  "properties",
  "proto",
  "ps1",
  "py",
  "r",
  "rb",
  "rs",
  "scala",
  "scss",
  "sh",
  "sol",
  "sql",
  "svelte",
  "swift",
  "tex",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zig",
]);

const extensionless = new Set([
  "dockerfile",
  "gemfile",
  "justfile",
  "makefile",
  "procfile",
  "rakefile",
]);

export function isAcceptedAttachmentName(filename: string) {
  const normalized = filename.trim().toLowerCase();
  if (extensionless.has(normalized)) return true;
  if (
    [".dockerignore", ".editorconfig", ".env", ".gitignore"].some(
      (name) => normalized === name || normalized.startsWith(`${name}.`),
    )
  )
    return true;
  const extension = normalized.split(".").pop();
  return Boolean(extension && acceptedExtensions.has(extension));
}

export function attachmentBytes(attachments: MessageAttachment[]) {
  return attachments.reduce(
    (total, attachment) =>
      total + new TextEncoder().encode(attachment.text).byteLength,
    0,
  );
}

export async function readAttachments(
  files: File[],
  existing: MessageAttachment[],
) {
  if (existing.length + files.length > MAX_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_ATTACHMENTS} files per submission.`);
  }
  const selectedBytes = files.reduce((total, file) => total + file.size, 0);
  if (attachmentBytes(existing) + selectedBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments must total 100 KB or less.");
  }

  const next: MessageAttachment[] = [];
  for (const file of files) {
    if (!isAcceptedAttachmentName(file.name)) {
      throw new Error(`${file.name} is not a source-code or plain-text file.`);
    }
    const fileText = await file.text();
    if (fileText.includes("\0")) {
      throw new Error(`${file.name} appears to be a binary file.`);
    }
    next.push({ filename: file.name, text: fileText });
  }

  const combined = [...existing, ...next];
  if (attachmentBytes(combined) > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments must total 100 KB or less.");
  }
  return combined;
}
