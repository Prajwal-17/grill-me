import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
  isSelectableWorkspacePath,
  type ChallengeWorkspace,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { canonicalPath } from "../../shared/storage/canonical-path";
import { workspacesPath } from "../../shared/storage/paths";

export type WorkspaceChallenge = {
  id: string;
  profileId: string;
  number: number;
  title: string;
  topic: string | null;
  problemStatement: string;
  expectedOutcome: string;
  implementationBoundary: string | null;
  implementationMilestones: string[];
  constraints: string[];
  completionCriteria: string[];
  starterCode: string | null;
  workspacePath: string | null;
};

const markerDirectory = ".grill-me";
const markerName = "workspace.json";
const markerSchema = z.object({
  version: z.literal(1),
  challengeId: z.string().uuid(),
  profileId: z.string().uuid(),
  createdAt: z.string().datetime(),
  starterFile: z.string().max(255).nullable(),
  seededFiles: z.array(z.string().max(255)).max(20).default([]),
});
type WorkspaceMarker = z.infer<typeof markerSchema>;

const extensions: Record<string, string> = {
  bash: "sh",
  c: "c",
  "c#": "cs",
  "c++": "cpp",
  clojure: "clj",
  cpp: "cpp",
  csharp: "cs",
  css: "css",
  dart: "dart",
  elixir: "ex",
  erlang: "erl",
  go: "go",
  golang: "go",
  haskell: "hs",
  html: "html",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  lua: "lua",
  markdown: "md",
  md: "md",
  php: "php",
  plaintext: "txt",
  pseudo: "txt",
  pseudocode: "txt",
  py: "py",
  python: "py",
  rb: "rb",
  react: "tsx",
  rs: "rs",
  ruby: "rb",
  rust: "rs",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  swift: "swift",
  text: "txt",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  txt: "txt",
  vue: "vue",
  yaml: "yml",
  yml: "yml",
};

const contextLanguages: [RegExp, string][] = [
  [/\btypescript\b/i, "ts"],
  [/\btsx\b/i, "tsx"],
  [/\bjavascript\b/i, "js"],
  [/\bnode(?:\.js)?\b/i, "js"],
  [/\bpython\b/i, "py"],
  [/\bgo(?:lang)?\b/i, "go"],
  [/\brust\b/i, "rs"],
  [/\bc#(?![#\w])/i, "cs"],
  [/\bjava\b/i, "java"],
  [/\bkotlin\b/i, "kt"],
  [/\bruby\b/i, "rb"],
  [/\bphp\b/i, "php"],
  [/\bswift\b/i, "swift"],
  [/\bc\+\+(?!\+)/i, "cpp"],
  [/\bsql\b/i, "sql"],
  [/\bhtml\b/i, "html"],
  [/\bcss\b/i, "css"],
  [/\breact\b/i, "tsx"],
];

function starterFileContent(starterCode: string) {
  const value = starterCode.trim();
  if (!value) return null;
  const fenced = /^```([a-zA-Z0-9_+#.-]*)[^\n]*\n([\s\S]*?)\n```\s*$/.exec(
    value,
  );
  const content = (fenced?.[2] ?? value).trimEnd();
  if (!content) return null;
  return { content, language: fenced?.[1]?.toLowerCase() ?? "" };
}

function extensionFor(language: string) {
  return extensions[language.toLowerCase()] ?? null;
}

function inferExtension(text: string) {
  for (const [pattern, extension] of contextLanguages)
    if (pattern.test(text)) return extension;
  return null;
}

function inferCodeExtension(code: string) {
  if (
    /^\s*(?:from\s+\S+\s+import|import\s+\S+)/m.test(code) &&
    /\bdef\s+/.test(code)
  )
    return "py";
  if (/\bdef\s+\w+\s*\(/.test(code)) return "py";
  if (/\b(?:interface|type)\s+\w+|:\s*(?:string|number|boolean)\b/.test(code))
    return "ts";
  if (
    /\bimport\s+(?:UIKit|SwiftUI|Foundation)\b|\bfunc\s+\w+\s*\([^)]*\)\s*->/.test(
      code,
    )
  )
    return "swift";
  if (/^\s*package\s+main\b|\bfunc\s+\w+\s*\(/m.test(code)) return "go";
  if (/\bfn\s+main\s*\(|\blet\s+mut\b/.test(code)) return "rs";
  if (
    /#include\s*<(?:stdio|stdlib|string|math|time|assert|ctype|errno|float|limits|locale|setjmp|signal|stdarg|stddef|stdint|wchar)\.h>/.test(
      code,
    )
  )
    return "c";
  if (
    /#include\s*<(?:iostream|vector|string|map|unordered_map|memory|algorithm|utility|sstream|fstream|array|deque|set|queue|stack|thread|mutex|chrono|optional|variant|tuple|string_view|bitset|complex|functional|numeric|iterator|regex|filesystem|random|atomic|future|list|forward_list|type_traits|iomanip|cstdint|cstring|cmath|cstdio|ctime|initializer_list|condition_variable)>|\bstd::|\busing\s+namespace\s+std\b|\btemplate\s*</.test(
      code,
    )
  )
    return "cpp";
  if (
    /\busing\s+System(?:\.[\w.]+)?\s*;|\bConsole\.WriteLine\b|\bnamespace\s+[A-Za-z_]\w*\s*[{;]/.test(
      code,
    )
  )
    return "cs";
  if (/\bpublic\s+(?:class|interface)\b|\bSystem\.out\b/.test(code))
    return "java";
  if (/#include\s*</.test(code)) return "c";
  if (/<\?php/.test(code)) return "php";
  if (/\bfunction\s+\w+\s*\(|\b(?:const|let)\s+\w+\s*=/.test(code)) return "js";
  if (/^\s*<[a-z][\s\S]*>/i.test(code)) return "html";
  return null;
}

export function starterAsset(
  challenge: Pick<
    WorkspaceChallenge,
    "title" | "topic" | "problemStatement" | "starterCode"
  >,
) {
  if (!challenge.starterCode) return null;
  // Old multi-file model responses are prose bundles, not a source file.
  // Keep any files already seeded, but never materialize another bundle.
  if (/^\s*={3,}\s*FILE:/m.test(challenge.starterCode)) return null;
  const parsed = starterFileContent(challenge.starterCode);
  if (!parsed) return null;
  const extension =
    extensionFor(parsed.language) ??
    inferExtension(`${challenge.title} ${challenge.topic ?? ""}`) ??
    inferExtension(challenge.problemStatement) ??
    inferCodeExtension(parsed.content) ??
    "txt";
  return { filename: `starter.${extension}`, content: parsed.content };
}

export function challengeWorkspaceFolderName(
  challenge: Pick<WorkspaceChallenge, "id" | "number" | "title">,
) {
  const slug =
    challenge.title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "challenge";
  const suffix =
    challenge.id
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 8)
      .toLowerCase() || "challenge";
  return `${String(challenge.number).padStart(4, "0")}-${slug}-${suffix}`;
}

export function challengeWorkspacePath(
  root: string,
  challenge: Pick<WorkspaceChallenge, "id" | "profileId" | "number" | "title">,
) {
  return join(
    root,
    "profiles",
    challenge.profileId,
    challengeWorkspaceFolderName(challenge),
  );
}

function list(items: string[]) {
  return items
    .map((item) => "- " + item.replace(/\s+/g, " ").trim())
    .join("\n");
}

function readme(challenge: WorkspaceChallenge, starterFile: string | null) {
  const sections = [
    `# #${challenge.number} ${challenge.title.replace(/\s+/g, " ").trim()}`,
    "## Task\n\n" + challenge.problemStatement.trim(),
    "## Expected outcome\n\n" + challenge.expectedOutcome.trim(),
    "## Requirements\n\n" + list(challenge.completionCriteria),
  ];
  if (challenge.constraints.length)
    sections.push("## Constraints\n\n" + list(challenge.constraints));
  if (challenge.implementationBoundary)
    sections.push(
      "## Implementation boundary\n\n" +
        challenge.implementationBoundary.trim(),
    );
  if (challenge.implementationMilestones.length)
    sections.push(
      "## Implementation milestones\n\n" +
        challenge.implementationMilestones
          .map(
            (item, index) =>
              `${index + 1}. ${item.replace(/\s+/g, " ").trim()}`,
          )
          .join("\n"),
    );
  sections.push(
    [
      "## Workspace",
      "Grill Me created this folder for the challenge. Add code, notes, artifacts, and subfolders here.",
      "Starter files are written once; existing files are never replaced.",
      ...(starterFile ? [`Starter file: \`${starterFile}\``] : []),
    ].join("\n\n"),
  );
  return sections.join("\n\n") + "\n";
}

async function readableDirectory(path: string) {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error("Not a directory");
  await access(path, constants.R_OK | constants.W_OK | constants.X_OK);
}

function fsCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function insideRoot(root: string, candidate: string) {
  const relativePath = relative(root, candidate);
  return (
    Boolean(relativePath) &&
    relativePath !== ".." &&
    !relativePath.startsWith(".." + sep) &&
    !isAbsolute(relativePath)
  );
}

function invalidWorkspacePath(message: string, path?: string) {
  return new AppError(
    "WORKSPACE_PATH_INVALID",
    message,
    400,
    false,
    path ? { path } : undefined,
  );
}

async function prepareRoot(path: string) {
  if (!isSelectableWorkspacePath(path))
    throw new AppError(
      "WORKSPACE_ROOT_INVALID",
      "Choose an absolute workspace folder other than the filesystem root.",
      400,
    );
  try {
    await mkdir(resolve(path), { recursive: true, mode: 0o700 });
    const root = await canonicalPath(resolve(path));
    if (root === sep || !isSelectableWorkspacePath(root))
      throw new AppError(
        "WORKSPACE_ROOT_INVALID",
        "Choose a workspace folder other than the filesystem root.",
        400,
      );
    await readableDirectory(root);
    return root;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "WORKSPACE_ROOT_UNAVAILABLE",
      "The challenge workspace root could not be created or used. Check the folder path and permissions in Settings → Advanced.",
      503,
      true,
    );
  }
}

async function prepareDirectory(path: string, recordedPath?: string) {
  const requested = resolve(path);
  if (!isAbsolute(path) || requested === sep)
    throw invalidWorkspacePath(
      "The challenge workspace folder is invalid.",
      recordedPath,
    );
  try {
    await mkdir(requested, { recursive: true, mode: 0o700 });
    const directory = await canonicalPath(requested);
    if (directory === sep)
      throw invalidWorkspacePath(
        "The challenge workspace folder is invalid.",
        recordedPath,
      );
    await readableDirectory(directory);
    return directory;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "WORKSPACE_UNAVAILABLE",
      recordedPath
        ? "The recorded challenge workspace folder is unavailable. Check the drive and permissions, or use the current workspace root."
        : "The challenge workspace folder cannot be opened. Check the folder path and permissions.",
      503,
      true,
      recordedPath ? { path: recordedPath } : undefined,
    );
  }
}

async function prepareScopedDirectory(root: string, path: string) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw invalidWorkspacePath(
        "The challenge workspace folder must stay inside the workspace root.",
      );
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (fsCode(error) !== "ENOENT") throw error;
  }
  await mkdir(path, { recursive: true, mode: 0o700 });
  const directory = await canonicalPath(path);
  if (!insideRoot(root, directory))
    throw invalidWorkspacePath(
      "The challenge workspace folder must stay inside the workspace root.",
    );
  return directory;
}

async function createDeterministicWorkspace(
  root: string,
  challenge: WorkspaceChallenge,
) {
  try {
    const profiles = await prepareScopedDirectory(root, join(root, "profiles"));
    const profile = await prepareScopedDirectory(
      root,
      join(profiles, challenge.profileId),
    );
    const path = join(profile, challengeWorkspaceFolderName(challenge));
    if (path.length > 4096)
      throw new AppError(
        "WORKSPACE_PATH_INVALID",
        "The challenge workspace path is too long. Choose a shorter workspace folder in Settings → Advanced.",
        400,
      );
    if (!insideRoot(root, path))
      throw invalidWorkspacePath(
        "The challenge workspace folder must stay inside the workspace root.",
      );
    const directory = await prepareDirectory(path);
    if (!insideRoot(root, directory))
      throw invalidWorkspacePath(
        "The challenge workspace folder must stay inside the workspace root.",
      );
    return directory;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "WORKSPACE_UNAVAILABLE",
      "The challenge workspace folder cannot be opened. Check the workspace root and folder permissions.",
      503,
      true,
    );
  }
}

async function resolveStoredWorkspace(
  challenge: WorkspaceChallenge,
  rootInput: string,
) {
  const stored = challenge.workspacePath!;
  if (!isAbsolute(stored) || resolve(stored) === sep)
    throw invalidWorkspacePath(
      "The recorded challenge workspace folder is invalid.",
      stored,
    );
  try {
    await stat(stored);
  } catch (error) {
    if (fsCode(error) !== "ENOENT")
      throw new AppError(
        "WORKSPACE_UNAVAILABLE",
        "The recorded challenge workspace folder is unavailable. Check the drive and permissions, or use the current workspace root.",
        503,
        true,
        { path: stored, code: fsCode(error) ?? null },
      );
    // A copied or restored data root no longer has the recorded absolute path.
    // Prefer the matching challenge folder under the current root, and never
    // recreate or move files at the old location.
    const root = await prepareRoot(rootInput);
    return createDeterministicWorkspace(root, challenge);
  }
  return prepareDirectory(stored, stored);
}

function metadataInvalid(message: string) {
  return invalidWorkspacePath(message);
}

async function existingMetadataDirectory(path: string) {
  const root = await canonicalPath(path);
  const directory = join(root, markerDirectory);
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (fsCode(error) === "ENOENT") return null;
    throw metadataInvalid(
      "The challenge workspace metadata cannot be inspected. Check its permissions.",
    );
  }
  if (info.isSymbolicLink() || !info.isDirectory())
    throw metadataInvalid(
      "The challenge workspace metadata path must be a real folder, not a symbolic link or file.",
    );
  const canonical = await canonicalPath(directory);
  if (!insideRoot(root, canonical))
    throw metadataInvalid(
      "The challenge workspace metadata must stay inside the workspace folder.",
    );
  return { root, directory: canonical };
}

async function ensureMetadataDirectory(path: string) {
  const existing = await existingMetadataDirectory(path);
  if (existing) return existing;
  const root = await canonicalPath(path);
  const directory = join(root, markerDirectory);
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (fsCode(error) !== "EEXIST") throw error;
  }
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory())
    throw metadataInvalid(
      "The challenge workspace metadata path must be a real folder, not a symbolic link or file.",
    );
  const canonical = await canonicalPath(directory);
  if (!insideRoot(root, canonical))
    throw metadataInvalid(
      "The challenge workspace metadata must stay inside the workspace folder.",
    );
  return { root, directory: canonical };
}

async function readMarker(path: string, challenge: WorkspaceChallenge) {
  try {
    const metadata = await existingMetadataDirectory(path);
    if (!metadata) return null;
    const markerPath = join(metadata.directory, markerName);
    const info = await lstat(markerPath);
    if (info.isSymbolicLink() || !info.isFile())
      throw metadataInvalid(
        "The challenge workspace marker must be a regular file, not a symbolic link or folder.",
      );
    if (info.size > 16 * 1024) return null;
    const canonical = await canonicalPath(markerPath);
    if (!insideRoot(metadata.root, canonical))
      throw metadataInvalid(
        "The challenge workspace marker must stay inside the workspace folder.",
      );
    const parsed = markerSchema.safeParse(
      JSON.parse(await readFile(canonical, "utf8")),
    );
    if (
      parsed.success &&
      parsed.data.challengeId === challenge.id &&
      parsed.data.profileId === challenge.profileId
    )
      return parsed.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (fsCode(error) === "ENOENT") return null;
    /* Corrupt or unreadable marker; recreate it below. */
  }
  return null;
}

async function writeMarker(path: string, marker: WorkspaceMarker) {
  const metadata = await ensureMetadataDirectory(path);
  const destination = join(metadata.directory, markerName);
  let existing;
  try {
    existing = await lstat(destination);
  } catch (error) {
    if (fsCode(error) !== "ENOENT") throw error;
  }
  if (existing && (existing.isSymbolicLink() || !existing.isFile()))
    throw metadataInvalid(
      "The challenge workspace marker must be a regular file, not a symbolic link or folder.",
    );
  const temporary = join(metadata.directory, `.${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(marker, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeMissing(path: string, content: string) {
  try {
    await writeFile(path, content, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "EISDIR") return false;
    throw error;
  }
}

export async function ensureChallengeWorkspace(input: {
  challenge: WorkspaceChallenge;
  root: string;
  /** Explicit recovery: ignore the recorded folder and use the current root. */
  relink?: boolean;
}): Promise<ChallengeWorkspace> {
  const { challenge } = input;
  let path: string;
  if (challenge.workspacePath && !input.relink) {
    path = await resolveStoredWorkspace(challenge, input.root);
  } else {
    const root = await prepareRoot(input.root);
    path = await createDeterministicWorkspace(root, challenge);
  }

  const existingMarker = await readMarker(path, challenge);
  const starter = starterAsset(challenge);
  const initialized = !existingMarker;
  let starterFile = existingMarker?.starterFile ?? starter?.filename ?? null;
  if (!existingMarker) {
    const seededFiles: string[] = [];
    if (
      await writeMissing(
        join(path, "README.md"),
        readme(challenge, starterFile),
      )
    )
      seededFiles.push("README.md");
    if (starter) {
      if (await writeMissing(join(path, starter.filename), starter.content))
        seededFiles.push(starter.filename);
      starterFile = starter.filename;
    }
    await writeMarker(path, {
      version: 1,
      challengeId: challenge.id,
      profileId: challenge.profileId,
      createdAt: new Date().toISOString(),
      starterFile,
      seededFiles,
    });
  } else if (!existingMarker.starterFile && starter) {
    // A marker can predate starter support in this local app. Never replace an
    // existing file, but make the generated starter available once.
    if (await writeMissing(join(path, starter.filename), starter.content)) {
      starterFile = starter.filename;
      await writeMarker(path, {
        ...existingMarker,
        starterFile,
        seededFiles: [...existingMarker.seededFiles, starter.filename],
      });
    }
  }

  return { path, initialized, starterFile };
}

export function createChallengeWorkspaceService(
  root: () => string = workspacesPath,
) {
  const pending = new Map<string, Promise<ChallengeWorkspace>>();
  return {
    ensure(challenge: WorkspaceChallenge, options: { relink?: boolean } = {}) {
      const key = `${challenge.id}:${options.relink ? "relink" : "ensure"}`;
      const running = pending.get(key);
      if (running) return running;
      const task = ensureChallengeWorkspace({
        challenge,
        root: root(),
        relink: options.relink,
      }).finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    },
    root,
  };
}

export type ChallengeWorkspaceService = ReturnType<
  typeof createChallengeWorkspaceService
>;
