import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_NAME = "grill-me";
export const LEGACY_DATABASE_PATH = "./.data/grill-me.sqlite";
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const LEGACY_DATA_ROOT = resolve(MODULE_DIR, "../../../.data");

function configured(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function appEnvironment() {
  const value = configured("APP_ENV") ?? configured("NODE_ENV");
  return value === "production" || value === "test" ? value : "development";
}

export function appConfigRoot() {
  const direct = configured("GRILL_ME_HOME");
  if (direct) return resolve(direct);
  const configHome =
    configured("XDG_CONFIG_HOME") ?? join(homedir(), ".config");
  return resolve(configHome, APP_NAME);
}

export function databaseUrl() {
  const database =
    appEnvironment() === "production"
      ? "grill-me"
      : appEnvironment() === "test"
        ? "grill-me-test"
        : "grill-me-dev";
  return (
    configured("DATABASE_URL") ??
    `postgresql://grill_me:grill_me_local@localhost:5432/${database}`
  );
}

export function submissionsPath() {
  return resolve(
    configured("SNAPSHOT_ROOT") ?? join(appConfigRoot(), "submissions"),
  );
}

export function uploadsPath() {
  return resolve(configured("UPLOAD_ROOT") ?? join(appConfigRoot(), "uploads"));
}

export function evaluationsPath() {
  return resolve(
    configured("EVALUATION_ROOT") ?? join(appConfigRoot(), "evaluations"),
  );
}

export function codexInstallPath() {
  return resolve(
    configured("CODEX_INSTALL_ROOT") ?? join(appConfigRoot(), "codex-cli"),
  );
}

function copyMissing(source: string, destination: string): boolean {
  const sourceStat = lstatSync(source);
  if (sourceStat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    return readdirSync(source).reduce(
      (copied, entry) =>
        copyMissing(join(source, entry), join(destination, entry)) || copied,
      false,
    );
  }
  if (existsSync(destination)) return false;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return true;
}

export function migrateLegacyData(
  legacyRoot = LEGACY_DATA_ROOT,
  destination = appConfigRoot(),
) {
  if (!existsSync(legacyRoot) || resolve(legacyRoot) === destination)
    return false;
  mkdirSync(destination, { recursive: true });

  const databaseFiles = [
    "grill-me.sqlite",
    "grill-me.sqlite-wal",
    "grill-me.sqlite-shm",
  ];
  let copied = false;
  if (!existsSync(join(destination, databaseFiles[0]!))) {
    for (const name of databaseFiles) {
      const source = join(legacyRoot, name);
      if (existsSync(source)) {
        copied = copyMissing(source, join(destination, name)) || copied;
      }
    }
  }

  for (const entry of readdirSync(legacyRoot)) {
    if (databaseFiles.includes(entry)) continue;
    copied =
      copyMissing(join(legacyRoot, entry), join(destination, entry)) || copied;
  }
  return copied;
}
