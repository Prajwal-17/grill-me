import type { MessageAttachment } from "@/shared/types/api";
import type { ComposerMode } from "@/features/chat/api/message-api";
export type WorkspaceTab =
  "statement" | "solution" | "review" | "reports" | "chat" | "hints";
export type Submission = {
  content: string;
  mode: ComposerMode;
  attachments: MessageAttachment[];
};
