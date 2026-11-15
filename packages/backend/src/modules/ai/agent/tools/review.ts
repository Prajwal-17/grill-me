import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { AppError } from "../../../../shared/errors/app-error";
import { projectRelativePath } from "../../../challenges/project-workspace";

/**
 * Read-only inspection tools for a challenge review. Reviews never execute the
 * submitted code and never write to the workspace.
 */
export const reviewToolLimits = {
  maxFiles: 400,
  maxDepth: 8,
  maxReadBytes: 512 * 1024,
  maxTextChars: 120_000,
  maxReadLines: 2_000,
  defaultReadLines: 400,
  maxListEntries: 500,
} as const;

const ignoredDirectories = new Set([
  ".git",
  ".grill-me",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const ignoredFiles = new Set([".DS_Store"]);

export type ReviewFile = { path: string; bytes: number };

export type ReviewInventory = {
  root: string;
  files: ReviewFile[];
  truncated: boolean;
};

function isBinary(buffer: Buffer) {
  return buffer.subarray(0, 8_000).includes(0);
}

function inside(root: string, candidate: string) {
  const value = relative(root, candidate);
  return (
    Boolean(value) &&
    value !== ".." &&
    !value.startsWith(".." + sep) &&
    !isAbsolute(value)
  );
}

function text(value: string) {
  return { type: "text" as const, text: value };
}

async function reviewRoot(path: string) {
  const root = resolve(path);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory())
    throw new AppError(
      "REVIEW_WORKSPACE_MISSING",
      "The challenge workspace folder is missing. Recreate it before requesting a review.",
      409,
    );
  return realpath(root);
}

async function walk(
  root: string,
  visit: (entry: { path: string; bytes: number }) => boolean,
) {
  let files = 0;
  let truncated = false;
  const step = async (directory: string, depth: number) => {
    if (files >= reviewToolLimits.maxFiles) {
      truncated = true;
      return;
    }
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (files >= reviewToolLimits.maxFiles) {
        truncated = true;
        return;
      }
      if (child.isSymbolicLink()) continue;
      const childPath = join(directory, child.name);
      const display = relative(root, childPath).split(sep).join("/");
      if (child.isDirectory()) {
        if (ignoredDirectories.has(child.name.toLowerCase())) continue;
        if (depth < reviewToolLimits.maxDepth) await step(childPath, depth + 1);
        else truncated = true;
      } else if (child.isFile()) {
        if (ignoredFiles.has(child.name)) continue;
        const info = await lstat(childPath).catch(() => null);
        if (!info) continue;
        files++;
        if (!visit({ path: display, bytes: info.size })) {
          truncated = true;
          return;
        }
      }
    }
  };
  await step(root, 0);
  return truncated;
}

/** Bounded file inventory used to reject empty workspaces and brief the model. */
export async function reviewWorkspaceInventory(
  path: string,
): Promise<ReviewInventory> {
  const root = await reviewRoot(path);
  const files: ReviewFile[] = [];
  const truncated = await walk(root, (entry) => {
    files.push(entry);
    return files.length < reviewToolLimits.maxFiles;
  });
  return { root, files, truncated };
}

export function createReviewTools(path: string): AgentTool<any>[] {
  const list: AgentTool<any> = {
    name: "list_workspace_files",
    label: "List workspace files",
    description:
      "List files in the challenge workspace with their sizes. Paths are relative to the workspace root. Dependency output, VCS data, and Grill Me metadata are hidden; symbolic links are never followed.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative folder path. Defaults to the workspace root.",
        },
      },
      additionalProperties: false,
    },
    execute: async (_toolCallId: string, params: { path?: string }) => {
      const root = await reviewRoot(path);
      const inventory = await reviewWorkspaceInventory(root);
      if (inventory.files.length === 0)
        throw new AppError(
          "REVIEW_WORKSPACE_EMPTY",
          "Add your implementation files to the challenge workspace before requesting a review.",
          409,
        );
      const requested = params.path?.trim();
      const directory = requested
        ? join(root, projectRelativePath(requested))
        : root;
      const info = await stat(directory).catch(() => null);
      if (!info?.isDirectory()) throw new Error("That path is not a folder.");
      const entries = await walkFiles(
        root,
        directory,
        reviewToolLimits.maxListEntries,
      );
      return {
        content: [
          text(entries.length ? entries.join("\n") : "The folder is empty."),
        ],
        details: { path: requested ?? ".", entries: entries.length },
      };
    },
  };

  const read: AgentTool<any> = {
    name: "read_workspace_file",
    label: "Read workspace file",
    description:
      "Read a text file from the challenge workspace. Lines are prefixed with their 1-based line number. Symbolic links, dependency output, and credential files are inaccessible.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
        startLine: {
          type: "integer",
          minimum: 1,
          description: "First line to return. Defaults to 1.",
        },
        lineCount: {
          type: "integer",
          minimum: 1,
          maximum: reviewToolLimits.maxReadLines,
          description: "Maximum lines to return. Defaults to 400.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId: string,
      params: { path: string; startLine?: number; lineCount?: number },
    ) => {
      const root = await reviewRoot(path);
      const relativePath = projectRelativePath(params.path);
      const candidate = join(root, relativePath);
      const info = await lstat(candidate).catch(() => null);
      if (!info?.isFile()) throw new Error("That file does not exist.");
      if (info.isSymbolicLink())
        throw new Error("Symbolic links cannot be reviewed.");
      const real = await realpath(candidate).catch(() => null);
      if (!real || !inside(root, real))
        throw new Error("That file is outside the challenge workspace.");
      if (info.size > reviewToolLimits.maxReadBytes)
        throw new Error(
          `That file exceeds the ${Math.round(reviewToolLimits.maxReadBytes / 1024)} KiB review limit.`,
        );
      const buffer = await readFile(real);
      if (isBinary(buffer))
        throw new Error("That file is binary and cannot be reviewed.");
      const lines = buffer.toString("utf8").split("\n");
      const startLine = Math.max(params.startLine ?? 1, 1);
      const lineCount = Math.min(
        Math.max(params.lineCount ?? reviewToolLimits.defaultReadLines, 1),
        reviewToolLimits.maxReadLines,
      );
      const selected = lines.slice(startLine - 1, startLine - 1 + lineCount);
      let body = selected
        .map((line, index) => `${startLine + index} | ${line}`)
        .join("\n");
      if (body.length > reviewToolLimits.maxTextChars)
        body =
          body.slice(0, reviewToolLimits.maxTextChars) +
          "\n[truncated at the review character limit]";
      const footer =
        startLine + lineCount <= lines.length
          ? `\n\n[lines ${startLine}–${startLine + selected.length - 1} of ${lines.length}]`
          : "";
      return {
        content: [text(body + footer)],
        details: { path: relativePath, bytes: buffer.length, startLine },
      };
    },
  };

  return [list, read];
}

async function walkFiles(root: string, directory: string, limit: number) {
  const entries: string[] = [];
  const display = (path: string) => relative(root, path).split(sep).join("/");
  const step = async (current: string, depth: number) => {
    if (entries.length >= limit) return;
    const children = await readdir(current, { withFileTypes: true }).catch(
      () => [],
    );
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (entries.length >= limit) return;
      if (child.isSymbolicLink()) continue;
      const childPath = join(current, child.name);
      if (child.isDirectory()) {
        if (ignoredDirectories.has(child.name.toLowerCase())) continue;
        entries.push(`${display(childPath)}/`);
        if (depth < reviewToolLimits.maxDepth) await step(childPath, depth + 1);
      } else if (child.isFile()) {
        if (ignoredFiles.has(child.name)) continue;
        const info = await lstat(childPath).catch(() => null);
        if (!info) continue;
        entries.push(`${display(childPath)} (${info.size} bytes)`);
      }
    }
  };
  await step(directory, 0);
  return entries;
}
