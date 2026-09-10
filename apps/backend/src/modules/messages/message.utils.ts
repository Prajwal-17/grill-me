import type { MessageRow } from "./message.model";
import { messageSchema, type ChatMessage } from "./message.schema";

export function toMessage(row: MessageRow): ChatMessage {
  return messageSchema.parse({
    ...row,
    attachments: row.attachments ?? [],
    createdAt: row.createdAt.toISOString(),
  });
}
