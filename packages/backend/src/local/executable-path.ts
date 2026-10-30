import { join } from "node:path";
import { readdirSync } from "node:fs";

/** Finder does not read shell startup files. Keep inherited PATH priority. */
export function executablePath(
  source: NodeJS.ProcessEnv,
  platform: string = process.platform,
) {
  if (platform !== "darwin") return source.PATH ?? "";
  const home = source.HOME;
  const paths = [
    source.PATH ?? "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  if (home) {
    paths.push(
      ...[
        ".local/bin",
        ".bun/bin",
        ".opencode/bin",
        ".npm-global/bin",
        ".volta/bin",
        "Library/pnpm",
        ".cargo/bin",
      ].map((dir) => join(home, dir)),
    );
    for (const base of [
      ".nvm/versions/node",
      ".local/share/fnm/node-versions",
      "Library/Application Support/fnm/node-versions",
    ]) {
      try {
        const versions = readdirSync(join(home, base)).sort((a, b) =>
          b.localeCompare(a, undefined, { numeric: true }),
        );
        paths.push(
          ...versions.map((v) =>
            join(
              home,
              base,
              v,
              base.includes("fnm") ? "installation/bin" : "bin",
            ),
          ),
        );
      } catch {
        /* Optional installation manager. */
      }
    }
  }
  return [
    ...new Set(paths.flatMap((value) => value.split(":")).filter(Boolean)),
  ].join(":");
}
