import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentPermissionMode } from "@repo/backend/shared/contracts";
import { authorizePermission, type PermissionAsk } from "../permission-policy";
import {
  deleteProjectJournal,
  emptyProjectJournal,
  projectAttemptNumber,
  projectFileRecord,
  projectRelativePath,
  readProjectJournal,
  validateProjectJournal,
  withGeneratedFile,
  writeProjectJournal,
  type ProjectFileRecord,
  type ProjectJournal,
  type ProjectJournalLocation,
  type ProjectLayout,
} from "../../../challenges/project-workspace";
import { AppError } from "../../../../shared/errors/app-error";
import { canonicalPath } from "../../../../shared/storage/canonical-path";

export const defaultProjectToolLimits = {
  maxFileBytes: 1024 * 1024,
  maxReadBytes: 2 * 1024 * 1024,
  maxTextChars: 120_000,
  maxReadLines: 2_000,
  maxListEntries: 500,
  maxSearchResults: 60,
  maxSearchBytes: 64 * 1024,
  maxProjectFiles: 500,
  maxProjectEntries: 2_000,
  maxDepth: 8,
};

export type ProjectToolLimits = typeof defaultProjectToolLimits;

export type ProjectToolActivity =
  | {
      type: "listed";
      path: string;
      entries: number;
      truncated: boolean;
    }
  | {
      type: "read";
      path: string;
      bytes: number;
      startLine: number;
      lineCount: number;
    }
  | {
      type: "searched";
      query: string;
      matches: number;
      truncated: boolean;
    }
  | { type: "created_directory"; path: string; created: boolean }
  | {
      type: "created_file";
      path: string;
      bytes: number;
      sha256: string;
    }
  | {
      type: "edited_file";
      path: string;
      bytes: number;
      sha256: string;
      replacements: number;
    };

export type ProjectToolJournalContext = {
  /** App-only metadata folder. It must stay outside the project tools root. */
  metadataRoot: string;
  /** Per-attempt generated-file journal JSON path. */
  journalPath: string;
  /** Defaults to the project root's folder name. */
  projectDirectory?: string;
  /** Journal already loaded by the lifecycle, used only when no journal exists. */
  journal?: ProjectJournal | null;
};

export type ProjectToolsOptions = {
  /** Absolute project folder the tools may access. */
  root: string;
  /** Persistent generated-file journal context outside the project root. */
  journal: ProjectToolJournalContext;
  signal?: AbortSignal;
  /** App-wide permission mode for this run. */
  permissionMode?: AgentPermissionMode;
  /** Ask the harness for approval when the mode requires it. */
  requestPermission?: PermissionAsk;
  /** Best-effort notification for legacy preparation activity. */
  onActivity?: (activity: ProjectToolActivity) => void | Promise<void>;
  /** Test and lifecycle overrides. Values are capped to safe maxima. */
  limits?: Partial<ProjectToolLimits>;
  now?: () => Date;
};

export function projectToolJournalContext(
  layout: ProjectLayout,
  journal?: ProjectJournal | null,
): ProjectToolJournalContext {
  return {
    metadataRoot: layout.metadataRoot,
    journalPath: layout.journalPath,
    projectDirectory: layout.projectDirectory,
    journal,
  };
}

const hardLimits: ProjectToolLimits = {
  maxFileBytes: 8 * 1024 * 1024,
  maxReadBytes: 8 * 1024 * 1024,
  maxTextChars: 200_000,
  maxReadLines: 5_000,
  maxListEntries: 2_000,
  maxSearchResults: 100,
  maxSearchBytes: 512 * 1024,
  maxProjectFiles: 5_000,
  maxProjectEntries: 20_000,
  maxDepth: 16,
};

function invalidPath(message: string) {
  return new AppError("PROJECT_PATH_INVALID", message, 400);
}

function notFound(message: string) {
  return new AppError("PROJECT_FILE_NOT_FOUND", message, 404);
}

function writeFailed(message: string) {
  return new AppError("PROJECT_WRITE_FAILED", message, 500, true);
}

function cancelled() {
  return new AppError(
    "PROJECT_OPERATION_CANCELLED",
    "The project operation was cancelled.",
    409,
    true,
  );
}

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
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

function isBinary(buffer: Buffer) {
  return buffer.subarray(0, 8_000).includes(0);
}

function hash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function text(value: string) {
  return { type: "text" as const, text: value };
}

function limit(
  limits: ProjectToolLimits,
  key: keyof ProjectToolLimits,
  value: number | undefined,
) {
  if (value === undefined) return limits[key];
  if (!Number.isInteger(value) || value < 1)
    throw new AppError(
      "PROJECT_LIMIT_INVALID",
      "Project tool limits must be positive integers.",
      400,
    );
  return Math.min(value, hardLimits[key]);
}

function normalizeLimits(
  input?: Partial<ProjectToolLimits>,
): ProjectToolLimits {
  const limits = { ...defaultProjectToolLimits };
  if (!input) return limits;
  for (const key of Object.keys(limits) as (keyof ProjectToolLimits)[]) {
    limits[key] = limit(limits, key, input[key]);
  }
  return limits;
}

type RootContext = { path: string; directory: string };

type EntryState = {
  path: string;
  parent: string;
  info: Awaited<ReturnType<typeof lstat>> | null;
};

export function createProjectTools(
  options: ProjectToolsOptions,
): AgentTool<any>[] {
  if (
    typeof options.root !== "string" ||
    !options.root.trim() ||
    options.root.includes("\0") ||
    !isAbsolute(options.root) ||
    resolve(options.root) === sep
  )
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "The project tools root must be an absolute folder other than the filesystem root.",
      400,
    );
  const rootPath = resolve(options.root);
  const projectDirectory =
    options.journal.projectDirectory ?? basename(rootPath);
  if (!projectAttemptNumber(projectDirectory))
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "The project folder name is invalid.",
      400,
    );
  if (
    typeof options.journal.metadataRoot !== "string" ||
    typeof options.journal.journalPath !== "string" ||
    !isAbsolute(options.journal.metadataRoot) ||
    !isAbsolute(options.journal.journalPath) ||
    options.journal.metadataRoot.includes("\0") ||
    options.journal.journalPath.includes("\0") ||
    resolve(options.journal.metadataRoot) === sep
  )
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "Project metadata paths must be absolute folders other than the filesystem root.",
      400,
    );
  const metadataRoot = resolve(options.journal.metadataRoot);
  const journalPath = resolve(options.journal.journalPath);
  if (metadataRoot === rootPath || inside(rootPath, metadataRoot))
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "Project metadata must stay outside the project tools root.",
      400,
    );
  if (!inside(metadataRoot, journalPath))
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "The project journal must stay inside project metadata.",
      400,
    );
  if (journalPath === rootPath || inside(rootPath, journalPath))
    throw new AppError(
      "PROJECT_LAYOUT_INVALID",
      "The project journal must stay outside the project tools root.",
      400,
    );

  const location: ProjectJournalLocation = {
    projectDirectory,
    metadataRoot,
    journalPath,
  };
  const limits = normalizeLimits(options.limits);
  const now = options.now ?? (() => new Date());
  const signal = options.signal;
  // The gateway passes the turn's mode. Direct tool callers (tests and
  // reusable helpers) are already trusted code, so they default to auto.
  const permissionMode = options.permissionMode ?? "auto";

  async function authorizeWrite(path: string, callSignal?: AbortSignal) {
    await authorizePermission({
      mode: permissionMode,
      actions: ["write_workspace"],
      summary: `Create or edit ${path} in this project.`,
      signal: callSignal ?? signal,
      ask: options.requestPermission,
    });
  }
  let seedJournal = options.journal.journal ?? null;
  if (seedJournal)
    seedJournal = validateProjectJournal(seedJournal, projectDirectory);
  let rootPromise: Promise<RootContext> | null = null;
  let queue: Promise<void> = Promise.resolve();

  function assertActive(callSignal?: AbortSignal) {
    if (signal?.aborted || callSignal?.aborted) throw cancelled();
  }

  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function prepareRoot(): Promise<RootContext> {
    let info;
    try {
      info = await lstat(rootPath);
    } catch (error) {
      if (fsCode(error) === "ENOENT")
        throw new AppError(
          "PROJECT_ROOT_UNAVAILABLE",
          "The challenge project folder does not exist.",
          404,
        );
      throw new AppError(
        "PROJECT_ROOT_UNAVAILABLE",
        "The challenge project folder is unavailable.",
        503,
        true,
      );
    }
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new AppError(
        "PROJECT_LAYOUT_INVALID",
        "The project tools root must be a real folder.",
        400,
      );
    let canonical: string;
    try {
      canonical = await canonicalPath(rootPath);
      await access(canonical, constants.R_OK | constants.X_OK);
    } catch {
      throw new AppError(
        "PROJECT_ROOT_UNAVAILABLE",
        "The challenge project folder cannot be read.",
        503,
        true,
      );
    }
    if (canonical === sep)
      throw new AppError(
        "PROJECT_LAYOUT_INVALID",
        "The project tools root cannot be the filesystem root.",
        400,
      );
    return { path: canonical, directory: projectDirectory };
  }

  function rootContext() {
    rootPromise ??= prepareRoot();
    return rootPromise;
  }

  async function loadJournal() {
    const disk = await readProjectJournal(location);
    return disk ?? seedJournal;
  }

  async function report(activity: ProjectToolActivity) {
    if (!options.onActivity) return;
    try {
      await options.onActivity(activity);
    } catch {
      // Activity reporting is best effort. A later lifecycle can rebuild
      // persisted UI state from the journal if a notification is lost.
    }
  }

  async function existingEntry(
    root: RootContext,
    path: string,
    callSignal?: AbortSignal,
  ): Promise<EntryState> {
    assertActive(callSignal);
    let cursor = root.path;
    const parts = path.split("/");
    for (const [index, part] of parts.entries()) {
      cursor = join(cursor, part);
      let info;
      try {
        info = await lstat(cursor);
      } catch (error) {
        if (fsCode(error) === "ENOENT")
          throw notFound(`Project path not found: ${path}`);
        throw new AppError(
          "PROJECT_FILE_UNREADABLE",
          `Project path cannot be read: ${path}`,
          503,
          true,
        );
      }
      assertActive(callSignal);
      if (info.isSymbolicLink())
        throw invalidPath("Project tools do not follow symbolic links.");
      if (index < parts.length - 1 && !info.isDirectory())
        throw invalidPath(`A parent of ${path} is not a directory.`);
    }
    let canonical: string;
    try {
      canonical = await canonicalPath(cursor);
    } catch {
      throw notFound(`Project path not found: ${path}`);
    }
    if (!inside(root.path, canonical))
      throw invalidPath("Project paths must stay inside the project root.");
    const info = await lstat(canonical);
    return { path: canonical, parent: dirname(canonical), info };
  }

  async function entryState(
    root: RootContext,
    path: string,
  ): Promise<EntryState> {
    let cursor = root.path;
    const parts = path.split("/");
    for (const [index, part] of parts.entries()) {
      cursor = join(cursor, part);
      let info;
      try {
        info = await lstat(cursor);
      } catch (error) {
        if (fsCode(error) === "ENOENT")
          return {
            path: cursor,
            parent: dirname(cursor),
            info: null,
          };
        throw new AppError(
          "PROJECT_FILE_UNREADABLE",
          `Project path cannot be read: ${path}`,
          503,
          true,
        );
      }
      if (info.isSymbolicLink())
        throw invalidPath("Project tools do not follow symbolic links.");
      if (index < parts.length - 1 && !info.isDirectory())
        throw invalidPath(`A parent of ${path} is not a directory.`);
      if (index === parts.length - 1)
        return { path: cursor, parent: dirname(cursor), info };
    }
    return { path: cursor, parent: dirname(cursor), info: null };
  }

  async function createMissingDirectories(
    root: RootContext,
    path: string,
  ): Promise<void> {
    let cursor = root.path;
    for (const part of path.split("/")) {
      cursor = join(cursor, part);
      let info;
      try {
        info = await lstat(cursor);
      } catch (error) {
        if (fsCode(error) !== "ENOENT")
          throw writeFailed(`Project folder could not be created: ${path}`);
        try {
          await mkdir(cursor, { mode: 0o700 });
        } catch (mkdirError) {
          if (fsCode(mkdirError) !== "EEXIST")
            throw writeFailed(`Project folder could not be created: ${path}`);
        }
        info = await lstat(cursor);
      }
      if (info.isSymbolicLink() || !info.isDirectory())
        throw invalidPath(`A parent of ${path} is not a real directory.`);
    }
    let canonical: string;
    try {
      canonical = await canonicalPath(cursor);
    } catch {
      throw writeFailed(`Project folder could not be resolved: ${path}`);
    }
    if (canonical !== root.path && !inside(root.path, canonical))
      throw invalidPath("Project folders must stay inside the project root.");
  }

  async function countEntries(root: RootContext) {
    let files = 0;
    let entries = 0;
    let truncated = false;
    const walk = async (directory: string) => {
      if (truncated) return;
      let children;
      try {
        children = await readdir(directory, { withFileTypes: true });
      } catch {
        throw new AppError(
          "PROJECT_FILE_UNREADABLE",
          "Some project folders cannot be read.",
          503,
          true,
        );
      }
      for (const child of children) {
        const childPath = join(directory, child.name);
        let display: string;
        try {
          display = relative(root.path, childPath).split(sep).join("/");
          projectRelativePath(display);
        } catch {
          continue;
        }
        entries++;
        if (entries > limits.maxProjectEntries) {
          truncated = true;
          return;
        }
        if (child.isSymbolicLink()) continue;
        if (child.isFile()) files++;
        else if (child.isDirectory()) await walk(childPath);
      }
    };
    await walk(root.path);
    return { files, entries, truncated };
  }

  async function ensureCapacity(root: RootContext, extraFiles: number) {
    const count = await countEntries(root);
    if (
      count.truncated ||
      count.entries + 1 > limits.maxProjectEntries ||
      count.files + extraFiles > limits.maxProjectFiles
    )
      throw new AppError(
        "PROJECT_LIMIT_REACHED",
        "This project reached the preparation file limit. Stop and inspect the existing files.",
        409,
      );
  }

  async function restoreJournal(previous: ProjectJournal | null) {
    try {
      if (previous) await writeProjectJournal(location, previous);
      else await deleteProjectJournal(location);
    } catch {
      throw new AppError(
        "PROJECT_METADATA_UNAVAILABLE",
        "Grill Me could not restore project metadata after a failed write. Stop preparation and inspect the project folder.",
        503,
        false,
      );
    }
  }

  async function persistBeforeWrite(
    journal: ProjectJournal | null,
    path: string,
    record: ProjectFileRecord,
  ) {
    const base =
      journal ?? emptyProjectJournal(location.projectDirectory, now());
    const next = withGeneratedFile(base, path, record);
    await writeProjectJournal(location, next);
    return { previous: journal, next };
  }

  async function atomicOverwrite(
    target: string,
    content: string,
    expectedSha256: string,
    relativePath: string,
  ) {
    const temporary = join(
      dirname(target),
      `.${basename(target)}.${crypto.randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
      const current = await readFile(target);
      if (hash(current) !== expectedSha256)
        throw new AppError(
          "PROJECT_FILE_MODIFIED",
          "That project file changed after it was read. Read it again before editing so user edits are preserved.",
          409,
          false,
          { path: relativePath },
        );
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  const list: AgentTool<any> = {
    name: "ls",
    label: "List project files",
    description:
      "List folders and files in the challenge project. Paths are relative to the project root. Symbolic links are shown but never followed.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path. Defaults to the project root.",
        },
      },
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { path?: string },
      callSignal?: AbortSignal,
    ) =>
      serialized(async () => {
        assertActive(callSignal);
        const requested = params.path?.trim() ?? "";
        const relativePath =
          !requested || requested === "."
            ? ""
            : projectRelativePath(params.path!);
        const root = await rootContext();
        await loadJournal();
        assertActive(callSignal);
        const start: {
          path: string;
          info?: Awaited<ReturnType<typeof lstat>> | null;
        } = relativePath
          ? await existingEntry(root, relativePath, callSignal)
          : { path: root.path };
        if (relativePath && !start.info!.isDirectory())
          throw invalidPath("That path is not a folder.");
        const entries: string[] = [];
        let truncated = false;
        let depthLimited = false;
        const walk = async (directory: string, depth: number) => {
          if (entries.length >= limits.maxListEntries) {
            truncated = true;
            return;
          }
          let children;
          try {
            children = await readdir(directory, { withFileTypes: true });
          } catch {
            throw new AppError(
              "PROJECT_FILE_UNREADABLE",
              "A project folder cannot be read.",
              503,
              true,
            );
          }
          children.sort((a, b) => a.name.localeCompare(b.name));
          for (const child of children) {
            assertActive(callSignal);
            if (entries.length >= limits.maxListEntries) {
              truncated = true;
              return;
            }
            const childPath = join(directory, child.name);
            let display: string;
            try {
              display = relative(root.path, childPath).split(sep).join("/");
              projectRelativePath(display);
            } catch {
              continue;
            }
            if (child.isSymbolicLink()) {
              entries.push(`${display} (symlink)`);
              continue;
            }
            if (child.isDirectory()) {
              entries.push(`${display}/`);
              if (depth < limits.maxDepth) await walk(childPath, depth + 1);
              else depthLimited = true;
            } else if (child.isFile()) {
              const info = await lstat(childPath).catch(() => null);
              if (!info) continue;
              entries.push(`${display} (${info.size} bytes)`);
            }
          }
        };
        await walk(start.path, 0);
        const footer = [
          truncated
            ? `[listing truncated at ${limits.maxListEntries} entries]`
            : "",
          depthLimited ? "[deeper folders were not listed]" : "",
        ]
          .filter(Boolean)
          .join("\n");
        await report({
          type: "listed",
          path: relativePath || ".",
          entries: entries.length,
          truncated: truncated || depthLimited,
        });
        return {
          content: [
            text(
              (entries.length
                ? entries.join("\n")
                : "The challenge project is empty.") +
                (footer ? "\n\n" + footer : ""),
            ),
          ],
          details: {
            path: relativePath || ".",
            entries: entries.length,
            truncated: truncated || depthLimited,
          },
        };
      }),
  };

  const read: AgentTool<any> = {
    name: "read",
    label: "Read project file",
    description:
      "Read a text file from the challenge project. Use startLine and lineCount for large files. Symbolic links and credential files are inaccessible.",
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
          maximum: defaultProjectToolLimits.maxReadLines,
          description: "Maximum lines to return.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { path: string; startLine?: number; lineCount?: number },
      callSignal?: AbortSignal,
    ) =>
      serialized(async () => {
        assertActive(callSignal);
        const relativePath = projectRelativePath(params.path);
        const root = await rootContext();
        await loadJournal();
        const entry = await existingEntry(root, relativePath, callSignal);
        const info = entry.info!;
        if (!info.isFile())
          throw invalidPath("That project path is not a file.");
        if (info.size > limits.maxReadBytes)
          throw new AppError(
            "PROJECT_FILE_TOO_LARGE",
            `That file exceeds the ${Math.round(limits.maxReadBytes / 1024 / 1024)} MiB project read limit.`,
            413,
          );
        let buffer;
        try {
          buffer = await readFile(entry.path);
        } catch {
          throw new AppError(
            "PROJECT_FILE_UNREADABLE",
            "That project file cannot be read.",
            503,
            true,
          );
        }
        assertActive(callSignal);
        if (isBinary(buffer))
          throw new AppError(
            "PROJECT_FILE_BINARY",
            "That project file is binary and cannot be read as text.",
            415,
          );
        const lines = buffer.toString("utf8").split("\n");
        const startLine = Math.max(params.startLine ?? 1, 1);
        const start = startLine - 1;
        const available = Math.max(lines.length - start, 0);
        const lineCount = Math.min(
          params.lineCount ?? available,
          limits.maxReadLines,
          available,
        );
        const selected = lines.slice(start, start + lineCount).join("\n");
        const truncated = selected.length > limits.maxTextChars;
        const body = truncated
          ? selected.slice(0, limits.maxTextChars)
          : selected;
        const footer =
          start >= lines.length
            ? `\n\n[line ${startLine} is past the end of the ${lines.length}-line file]`
            : lineCount < available
              ? `\n\n[lines ${startLine}–${startLine + lineCount - 1} of ${lines.length}]`
              : "";
        await report({
          type: "read",
          path: relativePath,
          bytes: buffer.length,
          startLine,
          lineCount,
        });
        return {
          content: [
            text(
              body +
                (truncated
                  ? `\n\n[File truncated at the ${limits.maxTextChars.toLocaleString()} character tool limit.]`
                  : "") +
                footer,
            ),
          ],
          details: { path: relativePath, bytes: buffer.length },
        };
      }),
  };

  const search: AgentTool<any> = {
    name: "grep",
    label: "Search project files",
    description:
      "Search challenge project text files for a literal string. Returns bounded matching lines with paths.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal text to find." },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: defaultProjectToolLimits.maxSearchResults,
          description: "Maximum matches. Defaults to 30.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { query: string; maxResults?: number },
      callSignal?: AbortSignal,
    ) =>
      serialized(async () => {
        assertActive(callSignal);
        const query = params.query.trim();
        if (!query) throw invalidPath("Enter a non-empty search string.");
        const needle = query.toLowerCase();
        const maxResults = Math.min(
          Math.max(params.maxResults ?? 30, 1),
          limits.maxSearchResults,
        );
        const root = await rootContext();
        await loadJournal();
        const matches: string[] = [];
        let bytes = 0;
        let truncated = false;
        const walk = async (directory: string, depth: number) => {
          if (matches.length >= maxResults || bytes >= limits.maxSearchBytes) {
            truncated = true;
            return;
          }
          let children;
          try {
            children = await readdir(directory, { withFileTypes: true });
          } catch {
            throw new AppError(
              "PROJECT_FILE_UNREADABLE",
              "A project folder cannot be read.",
              503,
              true,
            );
          }
          children.sort((a, b) => a.name.localeCompare(b.name));
          for (const child of children) {
            assertActive(callSignal);
            if (
              matches.length >= maxResults ||
              bytes >= limits.maxSearchBytes
            ) {
              truncated = true;
              return;
            }
            const childPath = join(directory, child.name);
            let display: string;
            try {
              display = relative(root.path, childPath).split(sep).join("/");
              projectRelativePath(display);
            } catch {
              continue;
            }
            if (child.isSymbolicLink()) continue;
            if (child.isDirectory()) {
              if (depth < limits.maxDepth) await walk(childPath, depth + 1);
              else truncated = true;
              continue;
            }
            if (!child.isFile()) continue;
            let info;
            try {
              info = await lstat(childPath);
            } catch {
              continue;
            }
            if (info.size > limits.maxReadBytes) continue;
            let buffer;
            try {
              buffer = await readFile(childPath);
            } catch {
              continue;
            }
            if (isBinary(buffer)) continue;
            for (const [index, line] of buffer
              .toString("utf8")
              .split("\n")
              .entries()) {
              if (
                matches.length >= maxResults ||
                bytes >= limits.maxSearchBytes
              ) {
                truncated = true;
                return;
              }
              if (!line.toLowerCase().includes(needle)) continue;
              const rendered = `${display}:${index + 1}: ${line.trim().slice(0, 300)}`;
              matches.push(rendered);
              bytes += Buffer.byteLength(rendered);
            }
          }
        };
        await walk(root.path, 0);
        await report({
          type: "searched",
          query,
          matches: matches.length,
          truncated,
        });
        return {
          content: [
            text(
              (matches.length
                ? matches.join("\n")
                : "No matches in the challenge project.") +
                (truncated
                  ? "\n\n[search stopped at the project tool limit]"
                  : ""),
            ),
          ],
          details: { matches: matches.length, truncated },
        };
      }),
  };

  const createFile: AgentTool<any> = {
    name: "write",
    label: "Create project file",
    description:
      "Create a new text file in the challenge project. The file must not exist; use edit for generated files. Parent folders are created. Grill Me records the generated file hash before writing.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
        content: { type: "string", description: "Complete file contents." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    execute: async (
      _toolCallId,
      params: { path: string; content: string },
      callSignal?: AbortSignal,
    ) =>
      serialized(async () => {
        assertActive(callSignal);
        const relativePath = projectRelativePath(params.path);
        if (relativePath.split("/")[0]?.toLowerCase() === "challenge.md")
          throw invalidPath(
            "CHALLENGE.md is managed by Grill Me and cannot be changed by project tools.",
          );
        const bytes = Buffer.byteLength(params.content);
        if (bytes > limits.maxFileBytes)
          throw new AppError(
            "PROJECT_FILE_TOO_LARGE",
            `That file exceeds the ${Math.round(limits.maxFileBytes / 1024 / 1024)} MiB project write limit.`,
            413,
          );
        const root = await rootContext();
        const journal = await loadJournal();
        const state = await entryState(root, relativePath);
        if (state.info)
          throw new AppError(
            "PROJECT_FILE_EXISTS",
            "That project file already exists. Read it and use edit, or create a different file.",
            409,
          );
        await ensureCapacity(root, 1);
        await authorizeWrite(relativePath, callSignal);
        const parent = dirname(relativePath);
        if (parent !== ".") await createMissingDirectories(root, parent);
        const current = await entryState(root, relativePath);
        if (current.info)
          throw new AppError(
            "PROJECT_FILE_EXISTS",
            "That project file was created by another operation. Read it before writing.",
            409,
          );
        const record = projectFileRecord(params.content, now());
        const { previous } = await persistBeforeWrite(
          journal,
          relativePath,
          record,
        );
        try {
          await writeFile(current.path, params.content, {
            flag: "wx",
            mode: 0o600,
          });
        } catch (error) {
          await restoreJournal(previous);
          if (fsCode(error) === "EEXIST")
            throw new AppError(
              "PROJECT_FILE_EXISTS",
              "That project file was created by another operation. Read it before writing.",
              409,
            );
          throw writeFailed("The project file could not be written.");
        }
        assertActive(callSignal);
        await report({
          type: "created_file",
          path: relativePath,
          bytes,
          sha256: record.sha256,
        });
        return {
          content: [text(`Created ${relativePath} (${bytes} bytes).`)],
          details: {
            path: relativePath,
            bytes,
            sha256: record.sha256,
          },
        };
      }),
  };

  const editFile: AgentTool<any> = {
    name: "edit",
    label: "Edit project file",
    description:
      "Replace an exact text fragment in a generated challenge project file. The file must match the last hash Grill Me recorded; user-edited or untracked files are never overwritten. Fails unless the fragment is found once, or replaceAll is true.",
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
      callSignal?: AbortSignal,
    ) =>
      serialized(async () => {
        assertActive(callSignal);
        const relativePath = projectRelativePath(params.path);
        if (relativePath.split("/")[0]?.toLowerCase() === "challenge.md")
          throw invalidPath(
            "CHALLENGE.md is managed by Grill Me and cannot be changed by project tools.",
          );
        if (!params.oldText) throw invalidPath("oldText cannot be empty.");
        const root = await rootContext();
        const journal = await loadJournal();
        const record = journal?.files[relativePath];
        if (!record)
          throw new AppError(
            "PROJECT_FILE_UNTRACKED",
            "That project file was not created by Grill Me. Existing and user-created files are never overwritten.",
            409,
          );
        await authorizeWrite(relativePath, callSignal);
        const entry = await existingEntry(root, relativePath, callSignal);
        const info = entry.info!;
        if (!info.isFile())
          throw invalidPath("That project path is not a file.");
        if (info.size > limits.maxReadBytes)
          throw new AppError(
            "PROJECT_FILE_TOO_LARGE",
            "That project file exceeds the project read limit.",
            413,
          );
        let originalBuffer;
        try {
          originalBuffer = await readFile(entry.path);
        } catch {
          throw new AppError(
            "PROJECT_FILE_UNREADABLE",
            "That project file cannot be read.",
            503,
            true,
          );
        }
        const currentHash = hash(originalBuffer);
        if (currentHash !== record.sha256)
          throw new AppError(
            "PROJECT_FILE_MODIFIED",
            "That project file changed after Grill Me wrote it. Read it and inspect the user's edits before continuing; they are never overwritten.",
            409,
            false,
            { path: relativePath },
          );
        if (isBinary(originalBuffer))
          throw new AppError(
            "PROJECT_FILE_BINARY",
            "That project file is binary and cannot be edited as text.",
            415,
          );
        const original = originalBuffer.toString("utf8");
        const matches = original.split(params.oldText).length - 1;
        if (!matches)
          throw new AppError(
            "PROJECT_EDIT_NOT_FOUND",
            "oldText was not found in that project file.",
            409,
          );
        if (matches > 1 && !params.replaceAll)
          throw new AppError(
            "PROJECT_EDIT_AMBIGUOUS",
            "oldText occurs more than once. Add surrounding context or set replaceAll.",
            409,
          );
        const next = params.replaceAll
          ? original.split(params.oldText).join(params.newText)
          : original.replace(params.oldText, params.newText);
        const bytes = Buffer.byteLength(next);
        if (bytes > limits.maxFileBytes)
          throw new AppError(
            "PROJECT_FILE_TOO_LARGE",
            `The edited file would exceed the ${Math.round(limits.maxFileBytes / 1024 / 1024)} MiB project write limit.`,
            413,
          );
        const nextRecord = projectFileRecord(next, now());
        const { previous } = await persistBeforeWrite(
          journal,
          relativePath,
          nextRecord,
        );
        try {
          await atomicOverwrite(entry.path, next, currentHash, relativePath);
        } catch (error) {
          await restoreJournal(previous);
          if (error instanceof AppError) throw error;
          throw writeFailed("The project file could not be updated.");
        }
        assertActive(callSignal);
        await report({
          type: "edited_file",
          path: relativePath,
          bytes,
          sha256: nextRecord.sha256,
          replacements: matches,
        });
        return {
          content: [
            text(
              `Updated ${relativePath} (${matches} replacement${matches === 1 ? "" : "s"}).`,
            ),
          ],
          details: {
            path: relativePath,
            bytes,
            sha256: nextRecord.sha256,
            replacements: matches,
          },
        };
      }),
  };

  return [list, read, search, createFile, editFile];
}
