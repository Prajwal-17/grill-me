import { z } from "zod";

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

export const messageAttachmentSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((value) => !/[\\/\r\n]/.test(value), {
      message: "Attachment filenames cannot contain paths or line breaks.",
    })
    .refine(isAcceptedAttachmentName, {
      message: "Only source-code and plain-text files are accepted.",
    }),
  text: z.string().refine((value) => !value.includes("\0"), {
    message: "Binary files are not accepted.",
  }),
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
});

export const createMessageRequestSchema = z
  .object({
    content: z.string().trim().default(""),
    mode: z.enum(["clarify", "review"]),
    attachments: z.array(messageAttachmentSchema).default([]),
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

export type ChatMessage = z.infer<typeof messageSchema>;
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;
export type ConversationMode = z.infer<
  typeof createMessageRequestSchema
>["mode"];
