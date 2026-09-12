import type {
  BuildDifficulty,
  BuildScope,
  Challenge,
  ClarificationContext,
  ChallengePreparation,
  GeneratedBuildContent,
} from "../challenges/challenge.schema";
import type {
  ChatMessage,
  MessageAttachment,
} from "../messages/message.schema";
import type { ProfilePreferences } from "../profiles/profile.schema";

export type ConversationMode = "clarify" | "review";

export type LearnerContext = {
  profileId: string;
  preferences: ProfilePreferences;
  recentChallenges: {
    title: string;
    scope: Challenge["scope"];
    contextualDifficulty: Challenge["contextualDifficulty"];
    legacyType: Challenge["type"];
    summary: string;
  }[];
};

export type BuildModelInput = {
  prompt: string;
  scope: BuildScope;
  difficulty: BuildDifficulty;
  clarificationContext: ClarificationContext | null;
  learner: LearnerContext;
};

export interface ModelGateway {
  prepareBuild(
    input: Omit<BuildModelInput, "clarificationContext">,
  ): Promise<ChallengePreparation>;
  generateBuild(input: BuildModelInput): Promise<GeneratedBuildContent>;
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
