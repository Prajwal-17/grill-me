import { eq } from "drizzle-orm";
import { db } from "../../../shared/database/db";
import { agentRunEvents, agentRuns } from "../../../shared/database/schema";
import { boundedValue } from "./events";

type AgentRunStart = {
  profileId: string;
  operation: string;
  challengeId?: string | null;
  resourceKind?: string | null;
  resourceId?: string | null;
  providerId: string;
  providerName: string;
  providerPreset: string;
  model: string;
  reasoningEffort?: string | null;
};

type AgentRunFinish = {
  status: "completed" | "failed" | "cancelled" | "interrupted";
  errorCode?: string | null;
  errorMessage?: string | null;
  turnCount?: number;
  toolCallCount?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

const sequences = new Map<string, number>();

export const agentRunStore = {
  async start(input: AgentRunStart) {
    const id = crypto.randomUUID();
    sequences.set(id, 0);
    try {
      await db.insert(agentRuns).values({
        id,
        profileId: input.profileId,
        operation: input.operation,
        challengeId: input.challengeId ?? null,
        resourceKind: input.resourceKind ?? null,
        resourceId: input.resourceId ?? null,
        providerId: input.providerId,
        providerName: input.providerName,
        providerPreset: input.providerPreset,
        model: input.model,
        reasoningEffort: input.reasoningEffort ?? null,
        status: "running",
        startedAt: new Date(),
      });
    } catch (error) {
      console.warn("[agent-run] Could not save run metadata.", error);
    }
    return id;
  },
  async event(runId: string, type: string, payload: unknown) {
    const sequence = (sequences.get(runId) ?? 0) + 1;
    sequences.set(runId, sequence);
    try {
      await db.insert(agentRunEvents).values({
        runId,
        sequence,
        type,
        payload: boundedValue(payload) ?? null,
        createdAt: new Date(),
      });
    } catch (error) {
      console.warn("[agent-run] Could not save run event.", error);
    }
  },
  async finish(runId: string, finish: AgentRunFinish) {
    sequences.delete(runId);
    try {
      await db
        .update(agentRuns)
        .set({
          status: finish.status,
          errorCode: finish.errorCode?.slice(0, 160) ?? null,
          errorMessage: finish.errorMessage?.slice(0, 4_000) ?? null,
          turnCount: finish.turnCount ?? 0,
          toolCallCount: finish.toolCallCount ?? 0,
          inputTokens: finish.inputTokens ?? null,
          outputTokens: finish.outputTokens ?? null,
          totalTokens: finish.totalTokens ?? null,
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, runId));
    } catch (error) {
      console.warn("[agent-run] Could not save run completion.", error);
    }
  },
  async markInterrupted() {
    try {
      await db
        .update(agentRuns)
        .set({
          status: "interrupted",
          errorCode: "AGENT_INTERRUPTED",
          errorMessage:
            "The app stopped before this run finished. Partial output is preserved; retry creates a new run.",
          completedAt: new Date(),
        })
        .where(eq(agentRuns.status, "running"));
    } catch (error) {
      console.warn("[agent-run] Could not mark interrupted runs.", error);
    }
  },
};
