import type { MessageAttachment } from "../../../messages/message.schema";

export type AgentOperation =
  | "preparation"
  | "generation"
  | "clarify"
  | "review"
  | "hint"
  | "quiz_generation"
  | "quiz_title_generation"
  | "prompt_enhancement"
  | "resume_import"
  | "verification";

export type CompletionSpec<T> = {
  name: string;
  description: string;
  schema: object;
  validate: (value: unknown) => T;
};

export type StructuredTask<T> = {
  operation: AgentOperation;
  instructions: string;
  context: string;
  userText: string;
  completion: CompletionSpec<T>;
  allowSnapshot: boolean;
};

export type TextTask = {
  operation: AgentOperation;
  instructions: string;
  context?: string;
  userText: string;
  attachments?: MessageAttachment[];
};
