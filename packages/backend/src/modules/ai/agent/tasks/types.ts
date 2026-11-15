import type { MessageAttachment } from "../../../messages/message.schema";

export type AgentOperation =
  | "preparation"
  | "generation"
  | "clarify"
  | "hint"
  | "review"
  | "quiz_generation"
  | "quiz_title_generation"
  | "prompt_enhancement"
  | "resume_import"
  | "project_scaffolding";

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
  allowResearch: boolean;
  /** Task-scoped runtime caps. Higher limits need a narrow, justified task. */
  limits?: {
    maxTurns?: number;
    maxToolCalls?: number;
    maxTextChars?: number;
  };
};

export type TextTask = {
  operation: AgentOperation;
  instructions: string;
  context?: string;
  userText: string;
  attachments?: MessageAttachment[];
};
