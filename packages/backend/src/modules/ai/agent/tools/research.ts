import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const MAX_COMMAND_OUTPUT = 64 * 1024;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_FETCH_BYTES = 8 * 1024 * 1024;
const DEFAULT_FETCH_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_LIST_ENTRIES = 500;

const IMAGE_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export type ResearchToolOptions = {
  workspace: string;
  allowImages?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  lookupHost?: (host: string) => Promise<{ address: string; family: number }[]>;
};

export async function createResearchWorkspace() {
  return mkdtemp(join(tmpdir(), "grill-me-research-"));
}

export async function removeResearchWorkspace(root: string) {
  await rm(root, { recursive: true, force: true });
}

function text(value: string) {
  return { type: "text" as const, text: value };
}

function rejectPath(path: string) {
  if (!path.trim()) throw new Error("Enter a file path.");
  if (path.includes("\0")) throw new Error("File paths cannot contain NUL.");
}

async function existingPath(root: string, path: string) {
  rejectPath(path);
  const safeRoot = await realpath(root);
  const candidate = await realpath(safeChild(root, path)).catch(() => {
    throw new Error(`File not found: ${path}`);
  });
  if (!inside(safeRoot, candidate))
    throw new Error("That path is outside the research workspace.");
  return safeRoot;
}

function inside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(root + sep);
}

function safeChild(root: string, path: string) {
  rejectPath(path);
  const candidate = resolve(root, path);
  if (!inside(resolve(root), candidate))
    throw new Error("That path is outside the research workspace.");
  return candidate;
}

async function writablePath(root: string, path: string) {
  const safeRoot = await realpath(root);
  const target = safeChild(root, path);
  const existing = await realpath(target).catch(() => null);
  if (existing && !inside(safeRoot, existing))
    throw new Error("That path is outside the research workspace.");
  const parent = await realpath(dirname(target)).catch(async () => {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    return realpath(dirname(target));
  });
  if (!inside(safeRoot, parent))
    throw new Error("That path is outside the research workspace.");
  return target;
}

function binary(buffer: Buffer) {
  return buffer.subarray(0, 8_000).includes(0);
}

function imageType(path: string, contentType?: string | null) {
  if (contentType?.startsWith("image/")) return contentType.split(";")[0]!;
  return IMAGE_TYPES[extname(path).toLowerCase()];
}

function imageExtension(contentType: string) {
  const entry = Object.entries(IMAGE_TYPES).find(
    ([, value]) => value === contentType,
  );
  return entry?.[0] ?? ".bin";
}

function commandEnvironment(root: string): NodeJS.ProcessEnv {
  const names = [
    "PATH",
    "Path",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "TERM",
    "SHELL",
    "ComSpec",
    "SystemRoot",
    "WINDIR",
  ];
  const environment: NodeJS.ProcessEnv = {};
  for (const name of names) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  environment.HOME = root;
  environment.TMPDIR = root;
  environment.TMP = root;
  environment.TEMP = root;
  return environment;
}

function runProcess(
  command: string,
  root: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ output: string; code: number | null }> {
  return new Promise((resolvePromise, reject) => {
    const shell =
      process.platform === "win32"
        ? { command: "cmd.exe", args: ["/d", "/s", "/c", command] }
        : { command: "/bin/sh", args: ["-lc", command] };
    const child = spawn(shell.command, shell.args, {
      cwd: root,
      env: commandEnvironment(root),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: () => void) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const kill = () => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const collect = (chunk: Buffer) => {
      if (bytes >= MAX_COMMAND_OUTPUT) return;
      const remaining = MAX_COMMAND_OUTPUT - bytes;
      const slice = chunk.subarray(0, remaining);
      chunks.push(slice);
      bytes += slice.length;
      if (bytes >= MAX_COMMAND_OUTPUT) kill();
    };
    const abort = () =>
      finish(() => {
        kill();
        reject(new Error("The command was cancelled."));
      });
    timer = setTimeout(
      () =>
        finish(() => {
          kill();
          reject(
            new Error(
              `The command timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
            ),
          );
        }),
      timeoutMs,
    );
    if (signal) {
      if (signal.aborted) {
        finish(() => reject(new Error("The command was cancelled.")));
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    }
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.on("error", (error) =>
      finish(() =>
        reject(new Error(`Could not run the command: ${error.message}`)),
      ),
    );
    child.on("close", (code) =>
      finish(() =>
        resolvePromise({
          output: Buffer.concat(chunks).toString("utf8"),
          code,
        }),
      ),
    );
  });
}

function isPrivateAddress(address: string) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  if (isIP(value) === 6) {
    if (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb") ||
      value.startsWith("ff") ||
      value.startsWith("2001:db8")
    )
      return true;
    return false;
  }
  if (isIP(value) !== 4) return true;
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part)))
    return true;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

async function publicUrl(
  raw: string,
  lookupHost: NonNullable<ResearchToolOptions["lookupHost"]>,
) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid http or https URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only http and https URLs can be fetched.");
  if (url.username || url.password)
    throw new Error("URLs with embedded credentials are not allowed.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  )
    throw new Error("Local and private network URLs are not allowed.");
  if (isIP(host)) {
    if (isPrivateAddress(host))
      throw new Error("Local and private network URLs are not allowed.");
    return url;
  }
  const addresses = await lookupHost(host).catch(() => []);
  if (!addresses.length)
    throw new Error(`Could not resolve the host ${url.hostname}.`);
  if (addresses.some((entry) => isPrivateAddress(entry.address)))
    throw new Error("Local and private network URLs are not allowed.");
  return url;
}

async function readLimited(response: Response, limit: number) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = limit - bytes;
    if (remaining <= 0) {
      await reader.cancel();
      break;
    }
    chunks.push(value.subarray(0, remaining));
    bytes += Math.min(value.length, remaining);
    if (bytes >= limit) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks);
}

function htmlToText(html: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const body = html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [title?.trim(), body].filter(Boolean).join("\n\n");
}

export function createResearchTools(
  options: ResearchToolOptions,
): AgentTool<any>[] {
  const root = resolve(options.workspace);
  const lookupHost =
    options.lookupHost ??
    (async (host: string) =>
      lookup(host, { all: true, verbatim: true }) as Promise<
        { address: string; family: number }[]
      >);

  const list: AgentTool<any> = {
    name: "list_files",
    label: "List files",
    description:
      "List files in the temporary research workspace. Use this to see files you saved or downloaded.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path. Defaults to the workspace.",
        },
      },
      additionalProperties: false,
    },
    execute: async (_toolCallId, params: { path?: string }) => {
      const start = await existingPath(root, params.path ?? ".");
      const entries: string[] = [];
      const walk = async (directory: string, depth: number) => {
        if (entries.length >= MAX_LIST_ENTRIES || depth > 8) return;
        const children = await readdir(directory, { withFileTypes: true });
        for (const child of children.sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          if (entries.length >= MAX_LIST_ENTRIES) return;
          const childPath = join(directory, child.name);
          const display = relative(root, childPath);
          if (child.isDirectory()) {
            entries.push(`${display}/`);
            await walk(childPath, depth + 1);
          } else if (child.isFile()) {
            const info = await stat(childPath);
            entries.push(`${display} (${info.size} bytes)`);
          } else if (child.isSymbolicLink()) {
            entries.push(`${display} (symlink)`);
          }
        }
      };
      await walk(start, 0);
      return {
        content: [
          text(
            entries.length
              ? entries.join("\n")
              : "The research workspace is empty.",
          ),
        ],
        details: { entries: entries.length },
      };
    },
  };

  const read: AgentTool<any> = {
    name: "read_file",
    label: "Read file",
    description:
      "Read a text file from the temporary research workspace. Use startLine and lineCount for large files. Supported images are returned as images when the selected model can view them.",
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
          maximum: 2_000,
          description: "Maximum lines to return. Defaults to all lines.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { path: string; startLine?: number; lineCount?: number },
      callSignal?: AbortSignal,
    ) => {
      if (callSignal?.aborted) throw new Error("The read was cancelled.");
      await existingPath(root, params.path);
      const target = await realpath(safeChild(root, params.path));
      const info = await stat(target);
      if (!info.isFile()) throw new Error("That path is not a file.");
      if (info.size > MAX_READ_BYTES)
        throw new Error(
          `That file exceeds the ${MAX_READ_BYTES / 1024 / 1024} MiB read limit.`,
        );
      const buffer = await readFile(target);
      const type = imageType(params.path);
      if (type) {
        if (!options.allowImages)
          throw new Error(
            "The selected model cannot view images. Read a text source instead.",
          );
        if (buffer.length > MAX_IMAGE_BYTES)
          throw new Error("That image exceeds the 4 MiB inspection limit.");
        return {
          content: [
            {
              type: "image" as const,
              data: buffer.toString("base64"),
              mimeType: type,
            },
            text(`${params.path} (${buffer.length} bytes, ${type})`),
          ],
          details: { path: params.path, bytes: buffer.length, mimeType: type },
        };
      }
      if (binary(buffer))
        throw new Error("That file is binary. Use a command to process it.");
      const lines = buffer.toString("utf8").split("\n");
      const start = Math.max((params.startLine ?? 1) - 1, 0);
      const count = Math.min(
        params.lineCount ?? Math.max(lines.length - start, 0),
        2_000,
      );
      const selected = lines.slice(start, start + count).join("\n");
      const truncated = selected.length > MAX_TEXT_CHARS;
      const body = truncated ? selected.slice(0, MAX_TEXT_CHARS) : selected;
      const footer =
        start > 0 || start + count < lines.length
          ? `\n\n[lines ${start + 1}–${Math.min(start + count, lines.length)} of ${lines.length}]`
          : "";
      return {
        content: [
          text(
            body +
              (truncated
                ? "\n\n[File truncated at the 120,000 character tool limit.]"
                : "") +
              footer,
          ),
        ],
        details: { path: params.path, bytes: buffer.length },
      };
    },
  };

  const write: AgentTool<any> = {
    name: "write_file",
    label: "Write file",
    description:
      "Create or replace a text file in the temporary research workspace. Parent directories are created.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
        content: { type: "string", description: "Complete file contents." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    execute: async (_toolCallId, params: { path: string; content: string }) => {
      const bytes = Buffer.byteLength(params.content);
      if (bytes > MAX_WRITE_BYTES)
        throw new Error(
          `That file exceeds the ${MAX_WRITE_BYTES / 1024 / 1024} MiB write limit.`,
        );
      const target = await writablePath(root, params.path);
      await writeFile(target, params.content, "utf8");
      return {
        content: [text(`Wrote ${bytes} bytes to ${params.path}.`)],
        details: { path: params.path, bytes },
      };
    },
  };

  const edit: AgentTool<any> = {
    name: "edit_file",
    label: "Edit file",
    description:
      "Replace an exact text fragment in a research workspace file. Fails unless the fragment is found once, or replaceAll is true.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
        oldText: { type: "string", description: "Exact text to replace." },
        newText: { type: "string", description: "Replacement text." },
        replaceAll: {
          type: "boolean",
          description: "Replace every occurrence. Defaults to false.",
        },
      },
      required: ["path", "oldText", "newText"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: {
        path: string;
        oldText: string;
        newText: string;
        replaceAll?: boolean;
      },
    ) => {
      if (!params.oldText) throw new Error("oldText cannot be empty.");
      await existingPath(root, params.path);
      const target = await realpath(safeChild(root, params.path));
      const original = await readFile(target, "utf8");
      const matches = original.split(params.oldText).length - 1;
      if (!matches) throw new Error("oldText was not found in that file.");
      if (matches > 1 && !params.replaceAll)
        throw new Error(
          "oldText occurs more than once. Add surrounding context or set replaceAll.",
        );
      const next = params.replaceAll
        ? original.split(params.oldText).join(params.newText)
        : original.replace(params.oldText, params.newText);
      if (Buffer.byteLength(next) > MAX_WRITE_BYTES)
        throw new Error("The edited file would exceed the 1 MiB write limit.");
      await writeFile(target, next, "utf8");
      return {
        content: [text(`Updated ${params.path}.`)],
        details: { path: params.path, replacements: matches },
      };
    },
  };

  const search: AgentTool<any> = {
    name: "search_files",
    label: "Search files",
    description:
      "Search research workspace text files for a literal string. Returns bounded matching lines with paths.",
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
      const walk = async (directory: string, depth: number) => {
        if (matches.length >= limit || bytes >= 64 * 1024 || depth > 8) return;
        const children = await readdir(directory, { withFileTypes: true });
        for (const child of children) {
          if (matches.length >= limit || bytes >= 64 * 1024) return;
          const childPath = join(directory, child.name);
          if (child.isDirectory()) {
            await walk(childPath, depth + 1);
            continue;
          }
          if (!child.isFile()) continue;
          const info = await stat(childPath);
          if (info.size > MAX_READ_BYTES || imageType(child.name)) continue;
          const buffer = await readFile(childPath);
          if (binary(buffer)) continue;
          for (const [index, line] of buffer
            .toString("utf8")
            .split("\n")
            .entries()) {
            if (matches.length >= limit || bytes >= 64 * 1024) return;
            if (!line.toLowerCase().includes(needle)) continue;
            const rendered = `${relative(root, childPath)}:${index + 1}: ${line.trim().slice(0, 300)}`;
            matches.push(rendered);
            bytes += Buffer.byteLength(rendered);
          }
        }
      };
      await walk(root, 0);
      return {
        content: [
          text(
            matches.length
              ? matches.join("\n")
              : "No matches in the research workspace.",
          ),
        ],
        details: { matches: matches.length },
      };
    },
  };

  const command: AgentTool<any> = {
    name: "run_command",
    label: "Run command",
    description:
      "Run a shell command in the temporary research workspace. Use it to inspect downloaded files and data, or to run small local scripts. The working directory and HOME are the workspace; the host environment and credentials are not exposed.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run." },
        timeoutSeconds: {
          type: "integer",
          minimum: 1,
          maximum: 120,
          description: "Timeout in seconds. Defaults to 30.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { command: string; timeoutSeconds?: number },
      callSignal?: AbortSignal,
    ) => {
      if (!params.command.trim()) throw new Error("Enter a command.");
      const timeoutMs = Math.min(
        Math.max(
          Math.round(
            (params.timeoutSeconds ?? DEFAULT_COMMAND_TIMEOUT_MS / 1_000) *
              1_000,
          ),
          1_000,
        ),
        MAX_COMMAND_TIMEOUT_MS,
      );
      const result = await runProcess(
        params.command,
        root,
        callSignal ?? options.signal,
        timeoutMs,
      );
      const output = result.output.trim();
      return {
        content: [
          text(
            `Exit code: ${result.code ?? "unknown"}\n\n${output || "(no output)"}`,
          ),
        ],
        details: { code: result.code, bytes: Buffer.byteLength(output) },
        isError: result.code !== 0,
      };
    },
  };

  const fetchUrl: AgentTool<any> = {
    name: "fetch_url",
    label: "Fetch URL",
    description:
      "Fetch an http or https URL and return readable text, or return an image when the selected model can view images. HTML is reduced to text. Use this to inspect a link supplied in the request.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "http or https URL." },
        saveTo: {
          type: "string",
          description:
            "Optional relative path for saving the response in the workspace.",
        },
        maxBytes: {
          type: "integer",
          minimum: 1_000,
          maximum: 8_000_000,
          description: "Maximum response bytes. Defaults to 2 MB.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { url: string; saveTo?: string; maxBytes?: number },
      callSignal?: AbortSignal,
    ) => {
      const limit = Math.min(
        Math.max(params.maxBytes ?? DEFAULT_FETCH_BYTES, 1_000),
        MAX_FETCH_BYTES,
      );
      const controller = new AbortController();
      const signal = callSignal ?? options.signal;
      if (signal?.aborted) throw new Error("The URL request was cancelled.");
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        let current = await publicUrl(params.url, lookupHost);
        for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
          const response = await (options.fetchImpl ?? fetch)(current, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              accept: "text/html,application/json,text/plain,image/*,*/*",
              "user-agent": "Grill-Me/1.0 (local practice companion)",
            },
          });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location)
              throw new Error(
                "The URL returned a redirect without a location.",
              );
            await response.body?.cancel().catch(() => {});
            current = await publicUrl(
              new URL(location, current).toString(),
              lookupHost,
            );
            continue;
          }
          if (!response.ok)
            throw new Error(
              `The URL returned HTTP ${response.status} ${response.statusText}.`,
            );
          const buffer = await readLimited(response, limit);
          const contentType = response.headers
            .get("content-type")
            ?.split(";")[0]
            ?.trim()
            .toLowerCase();
          const type =
            contentType?.startsWith("image/") && options.allowImages
              ? contentType
              : undefined;
          if (params.saveTo) {
            const target = await writablePath(root, params.saveTo);
            await writeFile(target, buffer);
            return {
              content: [
                text(
                  `Saved ${buffer.length} bytes from ${current.toString()} to ${params.saveTo}.`,
                ),
              ],
              details: {
                url: current.toString(),
                path: params.saveTo,
                bytes: buffer.length,
              },
            };
          }
          if (type) {
            if (buffer.length > MAX_IMAGE_BYTES)
              throw new Error("That image exceeds the 4 MiB inspection limit.");
            return {
              content: [
                {
                  type: "image" as const,
                  data: buffer.toString("base64"),
                  mimeType: type,
                },
                text(`${current.toString()} (${buffer.length} bytes, ${type})`),
              ],
              details: {
                url: current.toString(),
                bytes: buffer.length,
                mimeType: type,
              },
            };
          }
          const isText =
            !contentType ||
            contentType.startsWith("text/") ||
            /(?:json|xml|javascript|xml|x-yaml|yaml)/.test(contentType);
          if (!isText) {
            const extension =
              contentType && contentType.startsWith("image/")
                ? imageExtension(contentType)
                : extname(new URL(current).pathname).slice(0, 10) || ".bin";
            const digest = createHash("sha256")
              .update(buffer)
              .digest("hex")
              .slice(0, 16);
            const saved = join("downloads", `${digest}${extension}`);
            await mkdir(join(root, "downloads"), {
              recursive: true,
              mode: 0o700,
            });
            await writeFile(join(root, saved), buffer);
            return {
              content: [
                text(
                  `Downloaded ${buffer.length} bytes from ${current.toString()} to ${saved}. Use a command to process it.`,
                ),
              ],
              details: {
                url: current.toString(),
                path: saved,
                bytes: buffer.length,
                contentType,
              },
            };
          }
          const raw = buffer.toString("utf8");
          const body = contentType === "text/html" ? htmlToText(raw) : raw;
          const truncated = body.length > MAX_TEXT_CHARS;
          return {
            content: [
              text(
                (truncated ? body.slice(0, MAX_TEXT_CHARS) : body) +
                  (truncated
                    ? "\n\n[Response truncated at the 120,000 character tool limit.]"
                    : ""),
              ),
            ],
            details: {
              url: current.toString(),
              bytes: buffer.length,
              contentType,
            },
          };
        }
        throw new Error("The URL redirected too many times.");
      } catch (error) {
        if (controller.signal.aborted && !signal?.aborted)
          throw new Error("The URL request timed out.", { cause: error });
        if (signal?.aborted)
          throw new Error("The URL request was cancelled.", { cause: error });
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    },
  };

  return [list, read, write, edit, search, command, fetchUrl];
}
