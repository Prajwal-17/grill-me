import { z } from "zod";
import type {
  ProjectCommand,
  ProjectCommandAuthorization,
  ProjectCommandPurpose,
  ProjectCommandResult,
  ProjectCommandStatus,
} from "@repo/backend/shared/contracts";
import { projectCommandLimits } from "./project-command-runner";

/**
 * One exact command proposal. Every field is persisted before a command can
 * run, and install/network are explicit disclosures rather than isolation
 * claims. `checkId` links an executed check to the completion report result.
 */
export const projectCommandToolRequestSchema = z.strictObject({
  purpose: z.enum(["setup", "check", "run", "inspect"]),
  checkId: z.string().trim().min(1).max(80).optional().nullable(),
  command: z
    .string()
    .min(1)
    .max(projectCommandLimits.commandLength)
    .refine((value) => value.trim().length > 0, "Enter an exact command."),
  cwd: z
    .string()
    .max(projectCommandLimits.cwdLength)
    .default(".")
    .refine((value) => value.trim().length > 0, "Enter a working directory."),
  install: z.boolean(),
  network: z.boolean(),
  timeoutMs: z
    .number()
    .int()
    .min(1)
    .max(projectCommandLimits.maxTimeoutMs)
    .optional(),
});
export type ProjectCommandToolRequest = z.infer<
  typeof projectCommandToolRequestSchema
>;

/**
 * The bounded result returned to the scaffold agent. `result` is null when a
 * command never ran because it was rejected, stale, or interrupted.
 */
export type ProjectCommandToolResult = {
  id: string;
  purpose: ProjectCommandPurpose;
  checkId: string | null;
  status: ProjectCommandStatus;
  authorization: "individual" | "attempt" | null;
  command: string;
  cwd: string;
  install: boolean;
  network: boolean;
  timeoutMs: number;
  result: ProjectCommandResult | null;
};

export type ProjectCommandExecutor = (
  request: ProjectCommandToolRequest,
) => Promise<ProjectCommandToolResult>;

export type ProjectCommandState = ProjectCommand;
export type ProjectCommandAttemptAuthorization = ProjectCommandAuthorization;
