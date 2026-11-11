import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReleaseHistory } from "./release-history";

test("release history includes every versioned entry but excludes unreleased changes", () => {
  const changelog = readFileSync(
    new URL("../../../../../CHANGELOG.md", import.meta.url),
    "utf8",
  );
  const history = parseReleaseHistory(changelog);
  assert.deepEqual(
    history.map((entry) => entry.version),
    Array.from(
      changelog.matchAll(/^## desktop-v(\d+\.\d+\.\d+)\b/gm),
      (match) => match[1],
    ),
  );
  for (const version of ["0.1.0", "0.1.2", "0.1.5"]) {
    assert.ok(history.some((entry) => entry.version === version));
  }
  assert.ok(history.every((entry) => entry.date && entry.notes));
  assert.match(
    history.find((entry) => entry.version === "0.1.2")?.notes ?? "",
    /no installers or GitHub release were published/,
  );
  assert.deepEqual(
    parseReleaseHistory(
      "# Changelog\n\n## Unreleased\n\n- Pending\n\n## desktop-v1.0.0 - 1 Jan 2027\n\n- Shipped\n",
    ),
    [{ version: "1.0.0", date: "1 Jan 2027", notes: "- Shipped" }],
  );
});

test("release history parses Windows line endings", () => {
  assert.deepEqual(
    parseReleaseHistory("## desktop-v1.2.3 - 1 Jan 2027\r\n\r\n- A change\r\n"),
    [{ version: "1.2.3", date: "1 Jan 2027", notes: "- A change" }],
  );
});
