import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export async function runSqliteTests() {
  const root = resolve(import.meta.dir, "../../..");
  const temp = await mkdtemp(join(tmpdir(), "grill-me-desktop-tests-"));
  try {
    const tests = Bun.spawn(
      [
        process.execPath,
        "test",
        "--timeout",
        "15000",
        "--preload",
        "./apps/desktop/scripts/sqlite-preload.ts",
        "./apps/backend/test/app.test.ts",
        "./apps/backend/test/contracts.test.ts",
        "./apps/backend/test/local-runtime.test.ts",
        "./packages/client/src/index.test.ts",
        "./apps/backend/test/resume.test.ts",
        "./apps/backend/test/judge-tools.test.ts",
        "./apps/backend/test/project-folders.test.ts",
        "./apps/desktop/test/sqlite.test.ts",
        "./apps/desktop/test/identity.test.ts",
        "./apps/desktop/test/platform.test.ts",
        "./apps/desktop/test/cli-providers.test.ts",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          APP_ENV: "test",
          NODE_ENV: "test",
          GRILL_ME_DESKTOP: "1",
          GRILL_DESKTOP_CHANNEL: "development",
          GRILL_ME_HOME: temp,
          GRILL_ME_SQLITE_PATH: join(temp, "test.sqlite"),
        },
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    const stop = () => tests.kill("SIGINT");
    process.on("SIGINT", stop);
    try {
      return await tests.exited;
    } finally {
      process.off("SIGINT", stop);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
