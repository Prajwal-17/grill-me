import { apiRequest, streamRequest } from "@/shared/lib/api-client";
import type {
  Challenge,
  ChatMessage,
  MessageAttachment,
  ModelSelection,
} from "@/shared/types/api";

export type ComposerMode = "clarify";

export function getMessages(profileId: string, challengeId: string) {
  return apiRequest<ChatMessage[]>(
    `/challenges/${challengeId}/messages`,
    {},
    profileId,
  );
}

export function sendMessage(
  profileId: string,
  challengeId: string,
  content: string,
  mode: ComposerMode,
  attachments: MessageAttachment[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
  selection?: ModelSelection,
) {
  return streamRequest<ChatMessage>(
    `/challenges/${challengeId}/messages`,
    {
      method: "POST",
      signal,
      body: JSON.stringify({
        content,
        mode,
        attachments,
        ...(selection ? { selection } : {}),
      }),
    },
    profileId,
    onDelta,
  );
}

export function getHint(
  profileId: string,
  challengeId: string,
  onDelta: (delta: string) => void,
  kind: "hint" | "approach" = "hint",
) {
  return streamRequest<Challenge>(
    `/challenges/${challengeId}/hint?kind=${kind}`,
    { method: "POST", body: "{}" },
    profileId,
    onDelta,
  );
}

export function retryMessage(
  profileId: string,
  challengeId: string,
  messageId: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
  selection?: ModelSelection,
) {
  return streamRequest<ChatMessage>(
    `/challenges/${challengeId}/messages/${messageId}/retry`,
    {
      method: "POST",
      body: JSON.stringify(selection ? { selection } : {}),
      signal,
    },
    profileId,
    onDelta,
  );
}
