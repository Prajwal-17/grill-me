import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWebEnv } from "./env-schema";

test("all environments default to the same-origin API proxy", () => {
  for (const mode of ["development", "test", "production"]) {
    assert.deepEqual(parseWebEnv({}, mode), {
      appEnv: mode,
      apiUrl: "/api",
    });
  }
});

test("explicit environment overrides build mode and normalizes API paths", () => {
  assert.deepEqual(
    parseWebEnv(
      {
        VITE_APP_ENV: "test",
        VITE_API_URL: "http://127.0.0.1:18027/api/",
      },
      "production",
    ),
    { appEnv: "test", apiUrl: "http://127.0.0.1:18027/api" },
  );
  assert.deepEqual(parseWebEnv({}, "production"), {
    appEnv: "production",
    apiUrl: "/api",
  });
});

test("invalid frontend configuration fails before the app starts", () => {
  for (const url of [
    "",
    "//evil.example/api",
    "/other",
    "/api?key=secret",
    "not a URL",
    "file:///tmp/api",
    "ftp://localhost",
    "https://user:pass@localhost",
    "http://localhost?key=secret",
    "http://localhost#fragment",
  ]) {
    assert.throws(() => parseWebEnv({ VITE_API_URL: url }, "development"));
  }
  assert.throws(() => parseWebEnv({ VITE_APP_ENV: "prod" }, "development"));
});
