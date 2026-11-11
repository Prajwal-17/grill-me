import type { MessageAttachment } from "@/shared/types/api";

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

const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

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
  return Boolean(
    extension && (acceptedExtensions.has(extension) || extension in imageTypes),
  );
}

export function attachmentBytes(attachments: MessageAttachment[]) {
  return attachments.reduce(
    (total, attachment) =>
      total +
      new TextEncoder().encode(attachment.text).byteLength +
      (attachment.data ? Math.ceil((attachment.data.length * 3) / 4) : 0),
    0,
  );
}

export async function readAttachments(
  files: File[],
  existing: MessageAttachment[],
) {
  const next: MessageAttachment[] = [];
  for (const file of files) {
    if (!isAcceptedAttachmentName(file.name)) {
      throw new Error(`${file.name} is not a source-code or plain-text file.`);
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = imageTypes[extension];
    if (mimeType) {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(`${file.name} is larger than the 5 MiB image limit.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      next.push({
        filename: file.name,
        text: "",
        mimeType,
        data: btoa(binary),
      });
      continue;
    }
    const fileText = await file.text();
    if (fileText.includes("\0")) {
      throw new Error(`${file.name} appears to be a binary file.`);
    }
    next.push({ filename: file.name, text: fileText });
  }

  const combined = [...existing, ...next];
  return combined;
}
