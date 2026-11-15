import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

async function resolvePosixPath(path: string, links = 0) {
  if (links > 40) throw new Error("Too many symbolic links");
  const parts = path.split(sep);
  let current: string = sep;
  for (let index = 1; index < parts.length; index++) {
    const part = parts[index]!;
    if (!part || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    const next = current === sep ? join(sep, part) : join(current, part);
    const info = await lstat(next);
    if (info.isSymbolicLink()) {
      const target = await readlink(next);
      const absolute = resolve(dirname(next), target);
      const resolved = await resolvePosixPath(absolute, links + 1);
      current = resolved;
    } else current = next;
  }
  return current;
}

/**
 * Canonicalize an existing directory. Bun's realpath treats backslashes as path
 * separators even on POSIX, where they are legal file-name characters, so fall
 * back to an explicit component resolver for those paths.
 */
export async function canonicalPath(path: string) {
  try {
    return await realpath(path);
  } catch (error) {
    if (process.platform === "win32" || !path.includes("\\")) throw error;
    return resolvePosixPath(resolve(path));
  }
}
