import { z } from "zod";
import { modelSelectionSchema } from "@repo/contracts";

const sourceExtensions = new Set([
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

const extensionlessSourceFiles = new Set([
  "dockerfile",
  "gemfile",
  "justfile",
  "makefile",
  "procfile",
  "rakefile",
]);

export function isAcceptedAttachmentName(filename: string) {
  const normalized = filename.trim().toLowerCase();
  if (extensionlessSourceFiles.has(normalized)) return true;
  if (normalized.startsWith(".")) {
    return [".dockerignore", ".editorconfig", ".env", ".gitignore"].some(
      (name) => normalized === name || normalized.startsWith(`${name}.`),
    );
  }
  const extension = normalized.split(".").pop();
  return Boolean(extension && sourceExtensions.has(extension));
}

export const messageAttachmentSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/\r\n]/.test(value), {
        message: "Attachment filenames cannot contain paths or line breaks.",
      }),
    text: z
      .string()
      .default("")
      .refine((value) => !value.includes("\0"), {
        message: "Binary files are not accepted as text.",
      }),
    /** Supported image attachment data, when the selected model accepts images. */
    mimeType: z
      .string()
      .regex(/^image\/(?:png|jpeg|webp|gif)$/)
      .optional(),
    data: z.string().max(7_000_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.data && !value.mimeType)
      context.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: "Image attachments need a supported MIME type.",
      });
    if (!value.text && !value.data)
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Add text or image data.",
      });
    if (value.data && !/\.(?:png|jpe?g|webp|gif)$/i.test(value.filename))
      context.addIssue({
        code: "custom",
        path: ["filename"],
        message: "Image attachments must use png, jpeg, webp, or gif.",
      });
    if (!value.data && !isAcceptedAttachmentName(value.filename))
      context.addIssue({
        code: "custom",
        path: ["filename"],
        message:
          "Only source-code, plain-text, or supported image files are accepted.",
      });
  });

export const messageModeSchema = z.enum([
  "generate",
  "clarify",
  "review",
  "hint",
]);

export const messageSchema = z.object({
  id: z.string().uuid(),
  challengeId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  mode: messageModeSchema,
  content: z.string(),
  attachments: z.array(messageAttachmentSchema).default([]),
  createdAt: z.string(),
  status: z
    .enum(["streaming", "completed", "failed", "cancelled", "interrupted"])
    .default("completed"),
  error: z.string().nullable().default(null),
  replyTo: z.string().nullable().default(null),
});

export const createMessageRequestSchema = z
  .object({
    content: z.string().trim().default(""),
    mode: z.enum(["clarify", "review"]),
    attachments: z.array(messageAttachmentSchema).default([]),
    selection: modelSelectionSchema.optional(),
  })
  .superRefine((input, context) => {
    if (!input.content && input.attachments.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Add a message or attach at least one file.",
        path: ["content"],
      });
    }
    if (input.attachments.length > 0 && input.mode !== "review") {
      context.addIssue({
        code: "custom",
        message: "Attachments can only be submitted for solution review.",
        path: ["mode"],
      });
    }
  });

export const retryMessageRequestSchema = z.object({
  selection: modelSelectionSchema.optional(),
});

export type ChatMessage = z.infer<typeof messageSchema>;
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;
export type ConversationMode = z.infer<
  typeof createMessageRequestSchema
>["mode"];
