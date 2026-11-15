import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

// Electron keeps its bootstrap record beside its own userData directory. The
// setup file records the data root the developer chose during first run, which
// may differ from the default folder name.
const SETUP_CONFIG_FILE = "desktop-setup.json";
const EDITION_FOLDERS = {
  development: "grill-me-desktop-dev",
  production: "grill-me-desktop",
} as const;
type Edition = keyof typeof EDITION_FOLDERS;

function edition(): Edition {
  return process.env.GRILL_DESKTOP_CHANNEL === "production"
    ? "production"
    : "development";
}

function userDataRoot(value: Edition) {
  const configRoot =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : (process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"));
  return join(configRoot, EDITION_FOLDERS[value]);
}

function savedDataRoot(root: string) {
  try {
    const value = JSON.parse(
      readFileSync(join(root, SETUP_CONFIG_FILE), "utf8"),
    ) as { dataRoot?: unknown };
    return typeof value.dataRoot === "string" && value.dataRoot
      ? value.dataRoot
      : null;
  } catch {
    return null;
  }
}

// The desktop launcher sets GRILL_ME_SQLITE_PATH per edition. When the CLI is
// run outside the app, use that edition's setup record so the developer's
// actual database opens instead of a new empty file.
function editionDatabasePath(value: Edition) {
  const root = userDataRoot(value);
  const dataRoot = savedDataRoot(root);
  if (dataRoot) return join(dataRoot, "grill-me.sqlite");
  const fallback = join(root, "grill-me.sqlite");
  if (!existsSync(fallback))
    console.warn(
      `No ${value} setup found under ${root}. Start the ${value} app once, or set GRILL_ME_SQLITE_PATH to a database path.`,
    );
  return fallback;
}

export default defineConfig({
  schema: "./src/shared/database/schema.sqlite.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    // Override with GRILL_ME_SQLITE_PATH to inspect another edition's database.
    url: process.env.GRILL_ME_SQLITE_PATH ?? editionDatabasePath(edition()),
  },
});
