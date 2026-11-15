import type { AgentPermissionMode } from "@repo/backend/shared/contracts";
import { AppError } from "../../../shared/errors/app-error";

/**
 * One policy module decides every tool permission. Features must not invent
 * their own checks; they pass the action they are about to perform.
 */
export const permissionActions = [
  "read_workspace",
  "write_workspace",
  "run_command",
  "install",
  "network",
  "outside_workspace",
  "secrets",
] as const;
export type PermissionAction = (typeof permissionActions)[number];
export type PermissionDecision = "allow" | "ask" | "deny";
export type PermissionAsk = (input: {
  action: PermissionAction;
  prompt: string;
  signal?: AbortSignal;
}) => Promise<void>;

const allow = "allow" as const;
const ask = "ask" as const;
const deny = "deny" as const;

const matrix: Record<
  AgentPermissionMode,
  Record<PermissionAction, PermissionDecision>
> = {
  "approval-required": {
    read_workspace: allow,
    write_workspace: ask,
    run_command: ask,
    install: ask,
    network: ask,
    outside_workspace: ask,
    secrets: ask,
  },
  "auto-accept-edits": {
    read_workspace: allow,
    write_workspace: allow,
    run_command: ask,
    install: ask,
    network: ask,
    outside_workspace: ask,
    secrets: ask,
  },
  auto: {
    read_workspace: allow,
    write_workspace: allow,
    run_command: allow,
    install: ask,
    network: ask,
    outside_workspace: ask,
    secrets: ask,
  },
  "full-access": {
    read_workspace: allow,
    write_workspace: allow,
    run_command: allow,
    install: allow,
    network: allow,
    outside_workspace: deny,
    secrets: deny,
  },
};

export function permissionDecision(
  mode: AgentPermissionMode,
  action: PermissionAction,
): PermissionDecision {
  return matrix[mode][action];
}

export function permissionDecisionFor(
  mode: AgentPermissionMode,
  actions: PermissionAction[],
): PermissionDecision {
  return combine(actions.map((action) => permissionDecision(mode, action)));
}

function combine(decisions: PermissionDecision[]): PermissionDecision {
  if (decisions.includes("deny")) return "deny";
  if (decisions.includes("ask")) return "ask";
  return "allow";
}

const descriptions: Record<PermissionAction, string> = {
  read_workspace: "read files in the challenge workspace",
  write_workspace: "create or edit files in the challenge workspace",
  run_command: "run a command in the challenge workspace",
  install: "install dependencies",
  network: "access the network",
  outside_workspace: "access files outside the challenge workspace",
  secrets: "read local credentials or secrets",
};

export async function authorizePermission(input: {
  mode: AgentPermissionMode;
  actions: PermissionAction[];
  summary: string;
  signal?: AbortSignal;
  ask?: PermissionAsk;
}) {
  const decision = combine(
    input.actions.map((action) => permissionDecision(input.mode, action)),
  );
  if (decision === "allow") return;
  const denied = input.actions.find(
    (action) => permissionDecision(input.mode, action) === "deny",
  );
  if (decision === "deny")
    throw new AppError(
      "PERMISSION_DENIED",
      denied
        ? `This permission mode never allows the agent to ${descriptions[denied]} without an explicit override.`
        : "The current permission mode does not allow this action.",
      403,
    );
  if (!input.ask)
    throw new AppError(
      "PERMISSION_REQUIRED",
      `Approve that the agent may ${descriptions[denied ?? input.actions[0]!]}, then retry.`,
      409,
      true,
      { actions: input.actions, summary: input.summary },
    );
  await input.ask({
    action: denied ?? input.actions[0]!,
    prompt: input.summary,
    signal: input.signal,
  });
}

export function permissionLabel(action: PermissionAction) {
  return descriptions[action];
}
