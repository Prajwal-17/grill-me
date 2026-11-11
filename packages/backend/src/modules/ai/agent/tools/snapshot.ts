import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Manifest } from "../../../projects/snapshot";
import { readSnapshotFile } from "../../../projects/snapshot";

async function safeRoot(root: string) {
  return realpath(root);
}

function inside(root: string, candidate: string) {
  return candidate.startsWith(root + sep);
}

export function createSnapshotTools(
  workspace: string,
  manifest: Manifest,
): AgentTool<any>[] {
  const list: AgentTool<any> = {
    name: "list_submission_files",
    label: "List submission files",
    description:
      "List every source file in the saved submission snapshot with its size. Use this before reading.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => ({
      content: [
        {
          type: "text" as const,
          text:
            manifest
              .map((file) => `${file.path} (${file.bytes} bytes)`)
              .join("\n") || "The submission has no files.",
        },
      ],
      details: { files: manifest.map((file) => file.path) },
    }),
  };
  const read: AgentTool<any> = {
    name: "read_submission_file",
    label: "Read submission file",
    description:
      "Read one exact file path from the saved submission snapshot. Only the listed manifest paths are accessible.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Exact path from list_submission_files.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (_toolCallId, params: { path: string }) => {
      const root = await safeRoot(workspace);
      const candidate = await realpath(resolve(workspace, params.path)).catch(
        () => {
          throw new Error("Submission file not found.");
        },
      );
      if (!inside(root, candidate))
        throw new Error("Submission file path is outside the snapshot.");
      const file = await readSnapshotFile(workspace, manifest, params.path);
      if (file.binary) throw new Error("That submission file is binary.");
      if (file.tooLarge)
        throw new Error(
          "That submission file exceeds the 2 MiB inspection limit. Read a smaller file.",
        );
      const text = (file.content ?? "").slice(0, 120_000);
      return {
        content: [
          {
            type: "text" as const,
            text:
              text.length < (file.content?.length ?? 0)
                ? text +
                  "\n\n[File truncated at the 120,000 character tool limit.]"
                : text,
          },
        ],
        details: { path: file.path, bytes: file.bytes },
      };
    },
  };
  const search: AgentTool<any> = {
    name: "search_submission",
    label: "Search submission",
    description:
      "Search the saved submission snapshot for a literal string. Returns bounded matching lines with file paths.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal text to find." },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 60,
          description: "Maximum matches. Defaults to 30.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { query: string; maxResults?: number },
    ) => {
      const needle = params.query.trim().toLowerCase();
      if (!needle) throw new Error("Enter a non-empty search string.");
      const limit = Math.min(Math.max(params.maxResults ?? 30, 1), 60);
      const matches: string[] = [];
      let bytes = 0;
      for (const entry of manifest) {
        if (matches.length >= limit || bytes >= 64 * 1024) break;
        const file = await readSnapshotFile(workspace, manifest, entry.path);
        if (file.binary || file.tooLarge || !file.content) continue;
        for (const [index, line] of file.content.split("\n").entries()) {
          if (matches.length >= limit || bytes >= 64 * 1024) break;
          if (!line.toLowerCase().includes(needle)) continue;
          const text = `${file.path}:${index + 1}: ${line.trim().slice(0, 300)}`;
          matches.push(text);
          bytes += Buffer.byteLength(text);
        }
      }
      return {
        content: [
          {
            type: "text" as const,
            text: matches.length
              ? matches.join("\n")
              : "No matches in the saved submission.",
          },
        ],
        details: { matches: matches.length },
      };
    },
  };
  return [list, read, search];
}
