import { join } from "node:path";
export const settingKeys = [
  "CODEX_BIN",
  "CODEX_MODEL",
  "DIRECT_REVIEW_CONTEXT_TOKENS",
  "JUDGE_TIMEOUT_MS",
] as const;
export function backendEnvironment(input: {
  channel?: "development" | "production";
  dataRoot: string;
  token: string;
  port: number;
  rendererRoot: string;
  webOrigin?: string;
  workerPath?: string;
  keyringModule?: string;
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
    APP_ENV: input.channel ?? "development",
    NODE_ENV: input.channel ?? "development",
    GRILL_DESKTOP_CHANNEL: input.channel ?? "development",
    GRILL_ME_DESKTOP: "1",
    GRILL_ME_HOME: input.dataRoot,
    GRILL_ME_SQLITE_PATH: join(input.dataRoot, "grill-me.sqlite"),
    DESKTOP_API_TOKEN: input.token,
    API_PORT: String(input.port),
    DESKTOP_RENDERER_ROOT: input.rendererRoot,
    DESKTOP_WEB_ORIGIN: input.webOrigin ?? "",
    ...(input.keyringModule
      ? { GRILL_KEYRING_MODULE: input.keyringModule }
      : {}),
    ...(input.workerPath ? { DESKTOP_RESUME_WORKER: input.workerPath } : {}),
  };
}
