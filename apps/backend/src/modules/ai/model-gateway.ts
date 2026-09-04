import type {
  Challenge,
  ChallengeContent,
} from "../challenges/challenge.schema";
import type { ChatMessage } from "../messages/message.schema";

export type ConversationMode = "clarify" | "review";

export interface ModelGateway {
  generateChallenge(prompt: string): Promise<ChallengeContent>;
  respond(input: {
    challenge: Challenge;
    messages: ChatMessage[];
    content: string;
    mode: ConversationMode;
  }): AsyncIterable<string>;
  generateHint(input: {
    challenge: Challenge;
    messages: ChatMessage[];
  }): AsyncIterable<string>;
}
