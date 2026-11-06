import { join } from "node:path";
import { readdirSync } from "node:fs";

/**
 * Desktop launchers do not read shell startup files. Keep inherited PATH
 * priority, then add common system and user installation directories.
 */
export function executablePath(
  source: NodeJS.ProcessEnv,
  platform: string = process.platform,
) {
  const home = source.HOME;
  const mac = platform === "darwin";
  const paths = [
    source.PATH ?? "",
    ...(mac
      ? [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
        ]
      : []),
  ];
  if (home) {
    paths.push(
      ...[
        ".local/bin",
        ".bun/bin",
        ".opencode/bin",
        ".npm-global/bin",
        ".volta/bin",
        ".cargo/bin",
        ...(mac ? ["Library/pnpm"] : []),
      ].map((dir) => join(home, dir)),
    );
    for (const base of [
      ".nvm/versions/node",
      ".local/share/fnm/node-versions",
      ...(mac ? ["Library/Application Support/fnm/node-versions"] : []),
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
