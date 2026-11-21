import type {
  AgentPermissionMode,
  HarnessItemType,
  HarnessTransport,
} from "@repo/backend/shared/contracts";

/** Feature-supplied context that makes an agent run a visible harness thread. */
export type HarnessRunRequest = {
  threadId: string;
  /** Reuse a turn created by the feature. Omit to start the next turn. */
  turnId?: string;
  inputText: string;
};

export type HarnessThreadStart = {
  profileId: string;
  kind: string;
  title: string;
  challengeId?: string | null;
  parentThreadId?: string | null;
  transport?: HarnessTransport;
  connectionId?: string | null;
  model: string;
  reasoningEffort?: string | null;
  runtimeMode?: AgentPermissionMode;
};

export type HarnessItemInput = {
  type: HarnessItemType;
  status?: "pending" | "running" | "completed" | "cancelled" | "failed";
  title?: string | null;
  text?: string | null;
  payload?: Record<string, unknown>;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export type HarnessUsage = {
  input: number;
  output: number;
  totalTokens: number;
};
