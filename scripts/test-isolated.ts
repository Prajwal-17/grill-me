import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function runSqliteTests() {
  const root = resolve(import.meta.dir, "..");
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
        "./packages/backend/test/app.test.ts",
        "./packages/backend/test/composer-attachments.test.ts",
        "./packages/backend/test/agent-runtime.test.ts",
        "./packages/backend/test/agent-gateway.test.ts",
        "./packages/backend/test/agent-providers.test.ts",
        "./packages/backend/test/agent-migration.test.ts",
        "./packages/backend/test/harness.test.ts",
        "./packages/backend/test/permission-policy.test.ts",
        "./packages/backend/test/agent-tools.test.ts",
        "./packages/backend/test/agent-settings.test.ts",
        "./packages/backend/test/local-runtime.test.ts",
        "./apps/web/src/shared/lib/rpc-client.test.ts",
        "./apps/web/src/shared/lib/clipboard.test.ts",
        "./apps/web/src/features/challenges/lib/project-preparation-view.test.ts",
        "./apps/web/src/features/challenges/lib/workspace-editor-selection.test.ts",
        "./apps/web/src/features/harness/lib/activity.test.ts",
        "./apps/web/src/features/harness/lib/trajectory.test.ts",
        "./apps/web/src/features/harness/lib/work-duration.test.ts",
        "./apps/web/src/features/chat/lib/attachment-utils.test.ts",
        "./apps/web/src/features/settings/release-history.test.ts",
        "./packages/backend/test/resume.test.ts",
        "./packages/backend/test/project-folders.test.ts",
        "./packages/backend/test/challenge-workspace.test.ts",
        "./packages/backend/test/challenge-review.test.ts",
        "./packages/backend/test/project-workspace-tools.test.ts",
        "./packages/backend/test/project-files.test.ts",
        "./packages/backend/test/project-command-runner.test.ts",
        "./packages/backend/test/project-command-authorization.test.ts",
        "./packages/backend/test/project-preparation.test.ts",
        "./packages/backend/test/project-preparation-recovery.test.ts",
        "./apps/desktop/test/sqlite.test.ts",
        "./apps/desktop/test/workspace-editors.test.ts",
        "./apps/desktop/test/setup.test.ts",
        "./apps/desktop/test/identity.test.ts",
        "./apps/desktop/test/release-notes.test.ts",
        "./apps/desktop/test/platform.test.ts",
        "./apps/desktop/test/cli-providers.test.ts",
        "./apps/desktop/test/updater.test.ts",
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

process.exit(await runSqliteTests());
