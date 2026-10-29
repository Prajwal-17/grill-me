import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { windowSettingsSchema, type WindowSettings } from "@repo/contracts";
export function windowSettingsStore(root: string) {
  const path = join(root, "desktop-settings.json");
  let value: WindowSettings;
  try {
    const stored = JSON.parse(readFileSync(path, "utf8"));
    // Older versions persisted fullscreen alongside zoom. Preserve their zoom.
    value = windowSettingsSchema.parse({
      ...stored,
      startup: stored.startup === "fullscreen" ? "maximized" : stored.startup,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("Window settings could not be read; using defaults.");
    value = windowSettingsSchema.parse({});
  }
  return {
    get: () => ({ ...value }),
    set: (input: Partial<WindowSettings>) => {
      const next = windowSettingsSchema.parse({ ...value, ...input });
      const tmp = path + "." + crypto.randomUUID() + ".tmp";
      writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
      renameSync(tmp, path);
      value = next;
      return { ...value };
    },
  };
}
