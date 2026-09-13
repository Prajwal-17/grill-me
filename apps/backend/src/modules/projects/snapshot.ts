import { submissionPath } from "./paths";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readdir,
  lstat,
  realpath,
  copyFile,
  writeFile,
  readFile,
  rm,
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
import type { MessageAttachment } from "../messages/message.schema";
import { AppError } from "../../shared/errors/app-error";
import { submissionsPath } from "../../shared/storage/paths";

export const snapshotRoot = submissionsPath;
const excluded = new Set([
  ".git",
  "node_modules",
  "vendor",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".data",
  ".codex",
  ".ssh",
  ".aws",
  ".azure",
]);
const secretFile = (name: string) =>
  /^\.env(?:\.|$)/i.test(name) ||
  /(?:\.pem|\.key|\.p12|\.pfx)$/i.test(name) ||
  /^(?:credentials|auth\.json|id_rsa|id_ed25519)$/i.test(name);
export type Manifest = { path: string; sha256: string; bytes: number }[];
export type SnapshotFile = {
  path: string;
  bytes: number;
  content: string | null;
  binary: boolean;
  tooLarge: boolean;
};
const MAX_FILE_PREVIEW_BYTES = 2 * 1024 * 1024;
export async function projectRoot(path: string) {
  if (!isAbsolute(path))
    throw new AppError(
      "ABSOLUTE_PATH_REQUIRED",
      "Enter an absolute local project path.",
      400,
    );
  const root = await realpath(path).catch(() => {
    throw new AppError(
      "PROJECT_NOT_FOUND",
      "The backend cannot access that project folder. Check the path or Docker mount.",
      400,
    );
  });
  if (!(await lstat(root)).isDirectory() || root === sep)
    throw new AppError("INVALID_PROJECT", "Select a project folder.", 400);
  return root;
}
export async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function git(root: string, args: string[]) {
  if (!Bun.which("git")) return null;
  const proc = Bun.spawn(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  return (await proc.exited) === 0 ? output : null;
}
export async function captureSubmission(input: {
  id: string;
  root?: string;
  subdirectory?: string;
  baseRevision?: string;
  content: string;
  attachments: MessageAttachment[];
  uploads?: { filename: string; path: string }[];
}) {
  const dest = join(snapshotRoot(), input.id);
  const manifest: Manifest = [];
  await mkdir(dest, { recursive: true });
  const add = async (path: string) => {
    const file = join(dest, path);
    const stat = await lstat(file);
    manifest.push({ path, bytes: stat.size, sha256: await hashFile(file) });
  };
  let gitContext: Record<string, string | null> | null = null;
  try {
    if (input.root) {
      const root = await projectRoot(input.root);
      const source = await realpath(resolve(root, input.subdirectory || "."));
      if (source !== root && !source.startsWith(root + sep))
        throw new AppError(
          "INVALID_SUBDIRECTORY",
          "The submission folder must be inside the connected project.",
          400,
        );
      if (
        dest === source ||
        (dest.startsWith(source + sep) &&
          !relative(source, dest)
            .split(sep)
            .some((p) => excluded.has(p)))
      )
        throw new AppError(
          "SNAPSHOT_RECURSION",
          "Choose a project outside the submission storage folder.",
          400,
        );
      const walk = async (dir: string, prefix = "") => {
        for (const item of await readdir(dir, { withFileTypes: true })) {
          if (
            excluded.has(item.name) ||
            secretFile(item.name) ||
            item.isSymbolicLink()
          )
            continue;
          const path = join(prefix, item.name);
          const src = join(dir, item.name);
          if (item.isDirectory()) {
            await mkdir(join(dest, path), { recursive: true });
            await walk(src, path);
          } else if (item.isFile()) {
            const before = await lstat(src);
            await copyFile(src, join(dest, path));
            const after = await lstat(src);
            if (before.mtimeMs !== after.mtimeMs || before.size !== after.size)
              throw new AppError(
                "PROJECT_CHANGED",
                "A source file changed while capturing your submission. Submit again.",
                409,
                true,
              );
            await add(path);
          }
        }
      };
      await walk(source);
      const base = input.baseRevision?.trim();
      if (base?.startsWith("-"))
        throw new AppError(
          "INVALID_BASE",
          "Enter a Git revision, not an option.",
          400,
        );
      gitContext = {
        root: source,
        commit: await git(root, ["rev-parse", "HEAD"]),
        base: base ?? null,
        diff: await git(root, [
          "diff",
          ...(base ? [base] : ["HEAD"]),
          "--",
          input.subdirectory || ".",
        ]),
      };
    }
    for (const attachment of input.attachments) {
      if (
        attachment.filename !== basename(attachment.filename) ||
        secretFile(attachment.filename)
      )
        throw new AppError(
          "INVALID_FILE",
          "Use source files with plain filenames; credential files are excluded.",
          400,
        );
      if (manifest.some((f) => f.path === attachment.filename))
        throw new AppError(
          "DUPLICATE_FILE",
          `Duplicate submission filename: ${attachment.filename}`,
          400,
        );
      await writeFile(join(dest, attachment.filename), attachment.text);
      await add(attachment.filename);
    }
    for (const upload of input.uploads ?? []) {
      submissionPath(upload.filename);
      if (manifest.some((f) => f.path === upload.filename))
        throw new AppError(
          "INVALID_FILE",
          "Duplicate filename or credential file in submission.",
          400,
        );
      await mkdir(dirname(join(dest, upload.filename)), { recursive: true });
      await copyFile(upload.path, join(dest, upload.filename));
      await add(upload.filename);
    }
    if (!manifest.length && input.content.trim()) {
      const block = input.content.match(/```(\w*)\s*\n([\s\S]*?)```/);
      const ext: Record<string, string> = {
        python: "py",
        py: "py",
        javascript: "js",
        js: "js",
        typescript: "ts",
        ts: "ts",
        go: "go",
      };
      const name = "submission." + (ext[block?.[1] ?? ""] ?? "txt");
      await writeFile(join(dest, name), block?.[2] ?? input.content);
      await add(name);
    }
    if (!manifest.length)
      throw new AppError(
        "EMPTY_SUBMISSION",
        "No reviewable files were found. Choose the source folder or paste your implementation.",
        400,
      );
    if (Buffer.byteLength(input.content) > 16384) {
      let notesName = "__grill_submission_notes.txt";
      while (manifest.some((f) => f.path === notesName))
        notesName = "_" + notesName;
      await writeFile(join(dest, notesName), input.content);
      await add(notesName);
    }
    return { snapshotPath: dest, manifest, gitContext };
  } catch (error) {
    await rm(dest, { recursive: true, force: true });
    throw error;
  }
}
export async function readSnapshot(path: string, manifest: Manifest) {
  return Promise.all(
    manifest.map(async (file) => ({
      filename: file.path,
      text: await readFile(join(path, file.path), "utf8"),
    })),
  );
}

export async function readSnapshotFile(
  root: string,
  manifest: Manifest,
  requestedPath: string,
): Promise<SnapshotFile> {
  const file = manifest.find((entry) => entry.path === requestedPath);
  if (!file)
    throw new AppError("SUBMISSION_FILE_NOT_FOUND", "File not found.", 404);
  if (file.bytes > MAX_FILE_PREVIEW_BYTES)
    return {
      path: file.path,
      bytes: file.bytes,
      content: null,
      binary: false,
      tooLarge: true,
    };
  const bytes = await readFile(join(root, file.path));
  if (bytes.includes(0))
    return {
      path: file.path,
      bytes: file.bytes,
      content: null,
      binary: true,
      tooLarge: false,
    };
  try {
    return {
      path: file.path,
      bytes: file.bytes,
      content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      binary: false,
      tooLarge: false,
    };
  } catch {
    return {
      path: file.path,
      bytes: file.bytes,
      content: null,
      binary: true,
      tooLarge: false,
    };
  }
}
