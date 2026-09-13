import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLegacyData } from "../src/shared/storage/paths";

test("legacy app data is copied once without overwriting new data", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-storage-"));
  const legacy = join(root, ".data");
  const destination = join(root, ".config", "grill-me");
  try {
    await mkdir(join(legacy, "submissions", "first"), { recursive: true });
    await writeFile(join(legacy, "grill-me.sqlite"), "legacy database");
    await writeFile(join(legacy, "submissions", "first", "index.ts"), "old");

    expect(migrateLegacyData(legacy, destination)).toBe(true);
    expect(await readFile(join(destination, "grill-me.sqlite"), "utf8")).toBe(
      "legacy database",
    );
    expect(
      await readFile(
        join(destination, "submissions", "first", "index.ts"),
        "utf8",
      ),
    ).toBe("old");

    await writeFile(join(destination, "grill-me.sqlite"), "current database");
    await writeFile(
      join(destination, "submissions", "first", "index.ts"),
      "current",
    );
    expect(migrateLegacyData(legacy, destination)).toBe(false);
    expect(await readFile(join(destination, "grill-me.sqlite"), "utf8")).toBe(
      "current database",
    );
    expect(
      await readFile(
        join(destination, "submissions", "first", "index.ts"),
        "utf8",
      ),
    ).toBe("current");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
