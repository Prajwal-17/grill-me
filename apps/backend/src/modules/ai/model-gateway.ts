import type {
  Challenge,
  ChallengeContent,
  ChallengeFormat,
  ChallengePreparation,
} from "../challenges/challenge.schema";
import type {
  ChatMessage,
  MessageAttachment,
} from "../messages/message.schema";
import type { ProfilePreferences } from "../profiles/profile.schema";

export type ConversationMode = "clarify" | "review";

export type LearnerContext = {
  preferences: ProfilePreferences;
  recentChallenges: {
    title: string;
    type: Challenge["type"];
    summary: string;
  }[];
};

export type ChallengeModelInput = {
  prompt: string;
  format: ChallengeFormat;
  clarificationContext: string | null;
  learner: LearnerContext;
};

export interface ModelGateway {
  prepareChallenge(
    input: Omit<ChallengeModelInput, "clarificationContext">,
  ): Promise<ChallengePreparation>;
  generateChallenge(input: ChallengeModelInput): Promise<ChallengeContent>;
  critiqueChallenge(
    input: ChallengeModelInput & { draft: ChallengeContent },
  ): Promise<ChallengeContent>;
  respond(input: {
    challenge: Challenge;
    messages: ChatMessage[];
    content: string;
    mode: ConversationMode;
    attachments: MessageAttachment[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
  generateHint(input: {
    challenge: Challenge;
    messages: ChatMessage[];
    learner: LearnerContext;
  }): AsyncIterable<string>;
}
