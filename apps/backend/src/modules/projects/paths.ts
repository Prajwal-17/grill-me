import { AppError } from "../../shared/errors/app-error";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function configuredProjectsRoot() {
  const root = process.env.PROJECTS_ROOT?.trim();
  return root ? resolve(root) : null;
}

export function isWithinProjectsRoot(root: string, candidate: string) {
  const path = relative(root, candidate);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

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
export const secretFile = (name: string) =>
  /^\.env(?:\.|$)/i.test(name) ||
  /(?:\.pem|\.key|\.p12|\.pfx)$/i.test(name) ||
  /^(?:credentials|auth\.json|id_rsa|id_ed25519)$/i.test(name);
export const excludedPath = (path: string) =>
  path.split("/").some((part) => excluded.has(part) || secretFile(part));
export function submissionPath(path: string) {
  if (
    !path ||
    /[\\\0\r\n]/.test(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    excludedPath(path)
  )
    throw new AppError(
      "INVALID_FILE",
      "Choose source files inside the selected folder. Credential and generated files are excluded.",
      400,
    );
  return path;
}
