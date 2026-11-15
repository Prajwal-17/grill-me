import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentPermissionMode } from "@repo/backend/shared/contracts";
import { projectCommandLimits } from "../../../challenges/project-command-runner";
import type { ProjectCommandExecutor } from "../../../challenges/project-command.types";
import { AppError } from "../../../../shared/errors/app-error";
import {
  permissionDecisionFor,
  type PermissionAsk,
} from "../permission-policy";

const purposes = ["setup", "check", "run", "inspect"] as const;

/**
 * The only command execution surface available to the scaffold task. It is
 * created with a per-run executor that persists an exact request. The central
 * permission policy decides whether the current mode allows, asks, or denies
 * the command scope before the executor records it.
 */
export function createProjectCommandTool(
  execute: ProjectCommandExecutor,
  options?: {
    permissionMode?: AgentPermissionMode;
    requestPermission?: PermissionAsk;
    signal?: AbortSignal;
  },
): AgentTool<any> {
  const mode = options?.permissionMode ?? "auto";
  return {
    name: "run_project_command",
    label: "Run authorized project command",
    description:
      "Run one exact command in the prepared project. The command is recorded with its working directory and install/network disclosures. The app-wide permission mode decides whether it runs, asks for approval, or is denied. A rejected or stale command never runs. Commands run as your local user account, not in a sandbox; network access is not isolated. Use purpose setup for dependency installation, check for a final check command with its exact checkId, run for a proposed run command, and inspect for exploratory commands. Report only the structured result returned here. Do not retry a rejected command unchanged.",
    parameters: {
      type: "object",
      properties: {
        purpose: {
          type: "string",
          enum: purposes,
          description: "Why this exact command is needed.",
        },
        checkId: {
          type: "string",
          maxLength: 80,
          description:
            "The final check ID. Required for purpose check; omit for other purposes.",
        },
        command: {
          type: "string",
          maxLength: projectCommandLimits.commandLength,
          description: "Exact shell command to authorize and run.",
        },
        cwd: {
          type: "string",
          maxLength: projectCommandLimits.cwdLength,
          description:
            "Project-relative working directory. Defaults to the project root.",
        },
        install: {
          type: "boolean",
          description:
            "Declare whether this command may install dependencies. This is a disclosure, not an automatic install.",
        },
        network: {
          type: "boolean",
          description:
            "Declare whether this command may use network access. Network isolation is not enforced.",
        },
        timeoutMs: {
          type: "integer",
          minimum: 1,
          maximum: projectCommandLimits.maxTimeoutMs,
          description:
            "Requested timeout in milliseconds, clamped to the runner maximum.",
        },
      },
      required: ["purpose", "command", "install", "network"],
      additionalProperties: false,
    },
    executionMode: "sequential",
    execute: async (
      _toolCallId,
      params: {
        purpose: string;
        command: string;
        cwd?: string;
        install: boolean;
        network: boolean;
        timeoutMs?: number;
        checkId?: string;
      },
      callSignal?: AbortSignal,
    ) => {
      const actions = [
        "run_command" as const,
        ...(params.install ? (["install"] as const) : []),
        ...(params.network ? (["network"] as const) : []),
      ];
      const decision = permissionDecisionFor(mode, actions);
      if (decision === "deny")
        throw new AppError(
          "PERMISSION_DENIED",
          "The current permission mode does not allow this command.",
          403,
        );
      // Ask uses the existing durable project command request, which is bound
      // to the preparation attempt and asks before spawning. Allow skips that
      // pause; outside-workspace access is still denied above.
      const result = await execute(
        {
          purpose: params.purpose as (typeof purposes)[number],
          command: params.command,
          cwd: params.cwd ?? ".",
          install: params.install,
          network: params.network,
          timeoutMs: params.timeoutMs,
          checkId: params.checkId,
        },
        decision === "allow" ? { preauthorized: true } : undefined,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
        details: result,
      };
    },
  };
}
