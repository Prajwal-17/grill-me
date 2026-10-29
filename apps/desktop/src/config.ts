import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

export const settingKeys = [
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_MODEL",
  "CODEX_BIN",
  "CODEX_MODEL",
  "PROJECTS_ROOT",
  "DIRECT_REVIEW_CONTEXT_TOKENS",
  "JUDGE_TIMEOUT_MS",
] as const;
const template = `# Grill Me desktop development settings. Restart the app after editing.
# Credentials stay on this machine; this file is never bundled into a package.
LLM_BASE_URL=http://127.0.0.1:20128/v1
LLM_API_KEY=
LLM_MODEL=auto
# Optional: absolute paths to your native Codex CLI and project directory.
# CODEX_BIN=/absolute/path/to/codex
# PROJECTS_ROOT=/absolute/path/to/projects
`;
export function desktopConfiguration(dataRoot: string) {
  mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  const path = join(dataRoot, "backend.env");
  if (!existsSync(path))
    writeFileSync(path, template, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  const values = parse(readFileSync(path));
  return {
    path,
    values: Object.fromEntries(
      settingKeys
        .filter((key) => values[key]?.trim())
        .map((key) => [key, values[key]!]),
    ),
  };
}

export function backendEnvironment(input: {
  dataRoot: string;
  token: string;
  port: number;
  rendererRoot: string;
  webOrigin?: string;
  workerPath?: string;
  settings: Record<string, string>;
  inherited?: NodeJS.ProcessEnv;
}) {
  const source = input.inherited ?? process.env;
  // Never inherit backend .env settings or production database/storage overrides.
  const osKeys = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
    "SSH_AUTH_SOCK",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
  ];
  return {
    ...Object.fromEntries(
      osKeys
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, source[key]!]),
    ),
    ...Object.fromEntries(
      settingKeys
        .filter((key) => input.settings[key] !== undefined)
        .map((key) => [key, input.settings[key]!]),
    ),
    APP_ENV: "development",
    NODE_ENV: "development",
    GRILL_ME_DESKTOP: "1",
    GRILL_ME_HOME: input.dataRoot,
    GRILL_ME_SQLITE_PATH: join(input.dataRoot, "grill-me.sqlite"),
    DESKTOP_API_TOKEN: input.token,
    API_PORT: String(input.port),
    DESKTOP_RENDERER_ROOT: input.rendererRoot,
    DESKTOP_WEB_ORIGIN: input.webOrigin ?? "",
    ...(input.workerPath ? { DESKTOP_RESUME_WORKER: input.workerPath } : {}),
  };
}
