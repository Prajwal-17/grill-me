import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, chmod, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
test("release extraction includes only the selected version and fails for a missing entry", () => {
  const result = spawnSync("python3", ["scripts/release-notes.py", "0.1.6"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("GPT-6.1 Sol");
  expect(result.stdout).not.toContain("focused Home composer");
  expect(result.stdout).not.toContain("## desktop-v0.1.5");
  const missing = spawnSync("python3", ["scripts/release-notes.py", "9.9.9"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain("Missing nonempty");
  const invalidApply = spawnSync(
    "python3",
    ["scripts/release-notes.py", "0.1.6", "--apply"],
    { cwd: root, encoding: "utf8" },
  );
  expect(invalidApply.status).not.toBe(0);
  expect(invalidApply.stderr).toContain("--apply requires --backfill");
});

test("historical release backfill previews without writes and applies only existing desktop release bodies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grill-release-test-"));
  const log = join(directory, "edits.jsonl");
  try {
    const binary = join(directory, "gh");
    await writeFile(
      binary,
      `#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
if sys.argv[1:3] == ["release", "list"]:
    print(json.dumps([{"tagName":"desktop-v0.1.5"},{"tagName":"desktop-v0.1.0"},{"tagName":"unrelated-tag"}]))
elif sys.argv[1:3] == ["release", "edit"]:
    notes = Path(sys.argv[sys.argv.index("--notes-file") + 1]).read_text()
    with open(os.environ["GRILL_RELEASE_TEST_LOG"], "a") as stream:
        stream.write(json.dumps({"tag":sys.argv[3],"notes":notes}) + "\\n")
else:
    raise SystemExit("Unexpected GitHub command")
`,
    );
    await chmod(binary, 0o700);
    const options = {
      cwd: root,
      encoding: "utf8" as const,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GRILL_RELEASE_TEST_LOG: log,
      },
    };
    const preview = spawnSync(
      "python3",
      ["scripts/release-notes.py", "--backfill"],
      options,
    );
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain(
      "Previewed 2 releases. No GitHub changes made.",
    );
    expect(await Bun.file(log).exists()).toBe(false);
    const applied = spawnSync(
      "python3",
      ["scripts/release-notes.py", "--backfill", "--apply"],
      options,
    );
    expect(applied.status).toBe(0);
    const edits = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(edits.map((entry) => entry.tag)).toEqual([
      "desktop-v0.1.5",
      "desktop-v0.1.0",
    ]);
    expect(edits[0].notes).toContain("focused Home composer");
    expect(edits[0].notes).not.toContain("First Linux desktop release");
    expect(edits[1].notes).toContain("First Linux desktop release");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
