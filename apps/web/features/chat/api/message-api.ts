import { apiRequest, streamRequest } from "../../../shared/lib/api-client";
import type { Challenge, ChatMessage } from "../../../shared/types/api";

export type ComposerMode = "clarify" | "review";

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
  onDelta: (delta: string) => void,
) {
  return streamRequest<ChatMessage>(
    `/challenges/${challengeId}/messages`,
    { method: "POST", body: JSON.stringify({ content, mode }) },
    profileId,
    onDelta,
  );
}

export function getHint(
  profileId: string,
  challengeId: string,
  onDelta: (delta: string) => void,
) {
  return streamRequest<Challenge>(
    `/challenges/${challengeId}/hint`,
    { method: "POST", body: "{}" },
    profileId,
    onDelta,
  );
}
