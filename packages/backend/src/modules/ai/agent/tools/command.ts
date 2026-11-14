import type { AgentTool } from "@earendil-works/pi-agent-core";
import { projectCommandLimits } from "../../../challenges/project-command-runner";
import type { ProjectCommandExecutor } from "../../../challenges/project-command.types";

const purposes = ["setup", "check", "run", "inspect"] as const;

/**
 * The only command execution surface available to the scaffold task. It is
 * created with a per-run executor that persists an exact request and waits for
 * individual or attempt-wide approval before anything can start.
 */
export function createProjectCommandTool(
  execute: ProjectCommandExecutor,
): AgentTool<any> {
  return {
    name: "run_project_command",
    label: "Run authorized project command",
    description:
      "Run one exact command in the prepared project. The command is first recorded with its working directory and install/network disclosures, then pauses for the user's explicit approval unless the current preparation attempt already authorizes that scope. A rejected or stale command never runs. Commands run as your local user account, not in a sandbox; only the declared scope is approved, and network access is not isolated. Use purpose setup for dependency installation, check for a final check command with its exact checkId, run for a proposed run command, and inspect for exploratory commands. Report only the structured result returned here. Do not retry a rejected command unchanged.",
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
    execute: async (_toolCallId, params) => {
      const result = await execute(params);
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
