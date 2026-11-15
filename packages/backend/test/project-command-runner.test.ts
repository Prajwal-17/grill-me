import { afterAll, describe, expect, test } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  createProjectCommandRunner,
  type ProjectCommandAuthorization,
  type ProjectCommandRequest,
  type ProjectCommandRunner,
} from "@repo/backend/modules/challenges/project-command-runner";
import { canonicalPath } from "@repo/backend/shared/storage/canonical-path";

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

type FixtureOptions = {
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  terminationGraceMs?: number;
};

async function fixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "grill-project-command-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const projectRoot = join(workspace, "project");
  const metadataRoot = join(workspace, ".grill-me");
  await mkdir(join(projectRoot, "src", "nested"), { recursive: true });
  await mkdir(metadataRoot, { recursive: true });
  const canonicalProjectRoot = await canonicalPath(projectRoot);
  const canonicalMetadataRoot = await canonicalPath(metadataRoot);
  const runner = createProjectCommandRunner({
    projectRoot,
    metadataRoot,
    ...options,
  });
  return {
    root,
    projectRoot,
    metadataRoot,
    canonicalProjectRoot,
    canonicalMetadataRoot,
    runner,
  };
}

function currentAuthorization(
  attemptId = "attempt-1",
): ProjectCommandAuthorization {
  return {
    attemptId,
    isCurrent: (value) => value === attemptId,
  };
}

function checkedAuthorization(
  attemptId = "checked-1",
): ProjectCommandAuthorization {
  return { attemptId, checked: true };
}

function runCommand(
  runner: ProjectCommandRunner,
  request: ProjectCommandRequest,
  options: {
    authorization?: ProjectCommandAuthorization;
    signal?: AbortSignal;
  } = {},
) {
  return runner.run({
    request,
    authorization: options.authorization ?? currentAuthorization(),
    signal: options.signal,
  });
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(path: string, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await Bun.sleep(10);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function processRunning(pid: number) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform === "linux") {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      const state = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0];
      return state !== "Z";
    } catch {
      return false;
    }
  }
  return true;
}

async function waitUntilStopped(pid: number, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await processRunning(pid))) return;
    await Bun.sleep(20);
  }
  throw new Error(`Process ${pid} is still running after cancellation.`);
}

function killPid(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process already exited.
  }
}

describe("project command runner", () => {
  test("runs an authorized command in a validated nested project cwd", async () => {
    const { runner, canonicalProjectRoot } = await fixture();
    const expectedCwd = await canonicalPath(
      join(canonicalProjectRoot, "src", "nested"),
    );
    const result = await runCommand(runner, {
      command: "pwd",
      cwd: "src/nested",
      install: false,
      network: false,
    });

    expect(result.status).toBe("succeeded");
    expect(result.started).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBe(null);
    expect(result.stdout.trim()).toBe(expectedCwd);
    expect(result.stderr).toBe("");
    expect(result.output).toBe(result.stdout);
    expect(result.outputBytes).toBe(Buffer.byteLength(result.stdout));
    expect(result.truncated).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.error).toBe(null);
    expect(result.cwd).toBe("src/nested");
    expect(result.attemptId).toBe("attempt-1");
    expect(result.install).toBe(false);
    expect(result.network).toBe(false);
    expect(result.timeoutMs).toBe(30_000);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("accepts explicit checked authorization and reports disclosure flags", async () => {
    const { runner } = await fixture();
    const result = await runner.run({
      request: {
        command: "printf ok",
        install: true,
        network: true,
      },
      authorization: checkedAuthorization("checked-attempt"),
    });

    expect(result.status).toBe("succeeded");
    expect(result.started).toBe(true);
    expect(result.attemptId).toBe("checked-attempt");
    expect(result.install).toBe(true);
    expect(result.network).toBe(true);
    expect(result.output).toBe("ok");
  });

  test("rejects a superseded authorization fence before starting a child", async () => {
    const { runner, projectRoot } = await fixture();
    let calls = 0;
    const result = await runner.run({
      request: { command: "printf should-not-run > fence-marker.txt" },
      authorization: {
        attemptId: "stale-attempt",
        isCurrent: (attemptId) => {
          calls += 1;
          expect(attemptId).toBe("stale-attempt");
          return false;
        },
      },
    });

    expect(calls).toBe(1);
    expect(result.status).toBe("rejected");
    expect(result.started).toBe(false);
    expect(result.error?.code).toBe("PROJECT_COMMAND_NOT_AUTHORIZED");
    expect(await pathExists(join(projectRoot, "fence-marker.txt"))).toBe(false);
  });

  test("rejects a fence that throws before starting a child", async () => {
    const { runner, projectRoot } = await fixture();
    const result = await runner.run({
      request: { command: "printf should-not-run > threw-marker.txt" },
      authorization: {
        attemptId: "throwing-attempt",
        isCurrent: () => {
          throw new Error("approval store unavailable");
        },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.started).toBe(false);
    expect(result.error?.code).toBe("PROJECT_COMMAND_NOT_AUTHORIZED");
    expect(await pathExists(join(projectRoot, "threw-marker.txt"))).toBe(false);
  });

  test("returns a non-zero exit once without replaying the command", async () => {
    const { runner, projectRoot } = await fixture();
    const result = await runCommand(runner, {
      command: "printf x >> run-count.txt; exit 7",
    });

    expect(result.status).toBe("failed");
    expect(result.started).toBe(true);
    expect(result.exitCode).toBe(7);
    expect(result.signal).toBe(null);
    expect(result.error).toBe(null);
    expect(await readFile(join(projectRoot, "run-count.txt"), "utf8")).toBe(
      "x",
    );
  });

  test("rejects traversal, absolute, metadata, missing, and symlinked cwd paths", async () => {
    const { runner, projectRoot, root } = await fixture();
    const outside = join(root, "outside");
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(projectRoot, "escape"));
    await symlink(outside, join(projectRoot, "src", "linked"));

    for (const cwd of [
      "../outside",
      "/tmp",
      "src/../src",
      ".grill-me",
      ".git",
      "node_modules",
      "missing",
      "src//nested",
      "src/nested/",
      "escape",
      "src/linked",
    ]) {
      const result = await runCommand(runner, {
        command: "printf should-not-run > cwd-marker.txt",
        cwd,
      });
      expect(result.status).toBe("rejected");
      expect(result.started).toBe(false);
      expect(result.error?.code).toBe("PROJECT_COMMAND_CWD_INVALID");
      expect(result.cwd).toBe(cwd);
    }

    expect(await pathExists(join(projectRoot, "cwd-marker.txt"))).toBe(false);

    const linkedRoot = join(root, "project-link");
    await symlink(projectRoot, linkedRoot);
    const linkedRunner = createProjectCommandRunner({
      projectRoot: linkedRoot,
      metadataRoot: join(root, "linked-metadata"),
    });
    const linkedResult = await runCommand(linkedRunner, {
      command: "printf should-not-run > linked-root-marker.txt",
    });
    expect(linkedResult.status).toBe("rejected");
    expect(linkedResult.started).toBe(false);
    expect(linkedResult.error?.code).toBe("PROJECT_COMMAND_CWD_INVALID");
  });

  test("keeps app metadata outside the command root", async () => {
    const { root, projectRoot, metadataRoot } = await fixture();
    expect(() =>
      createProjectCommandRunner({
        projectRoot,
        metadataRoot: join(projectRoot, ".grill-me"),
      }),
    ).toThrow("outside the project root");
    expect(() =>
      createProjectCommandRunner({
        projectRoot: join(projectRoot, ".grill-me"),
        metadataRoot,
      }),
    ).toThrow("cannot be app metadata");
    expect(() =>
      createProjectCommandRunner({
        projectRoot,
        metadataRoot: root,
      }),
    ).toThrow("outside project command metadata");
    expect(metadataRoot).toContain(".grill-me");
  });

  test("returns without starting when the signal is already aborted", async () => {
    const { runner, projectRoot } = await fixture();
    const controller = new AbortController();
    controller.abort();
    const result = await runCommand(
      runner,
      { command: "printf should-not-run > aborted-marker.txt" },
      { signal: controller.signal },
    );

    expect(result.status).toBe("cancelled");
    expect(result.started).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.error?.code).toBe("PROJECT_COMMAND_CANCELLED");
    expect(await pathExists(join(projectRoot, "aborted-marker.txt"))).toBe(
      false,
    );
  });

  test("times out and escalates from SIGTERM to SIGKILL", async () => {
    const { runner, projectRoot } = await fixture({
      terminationGraceMs: 80,
    });
    await writeFile(
      join(projectRoot, "timeout-fixture.sh"),
      [
        "trap '' TERM",
        "sleep 30 &",
        "child=$!",
        'echo "$child" > timeout-child.pid',
        "wait",
        "",
      ].join("\n"),
    );

    let descendant: number | undefined;
    try {
      const result = await runCommand(runner, {
        command: "exec sh ./timeout-fixture.sh",
        timeoutMs: 200,
      });

      expect(result.status).toBe("timed_out");
      expect(result.started).toBe(true);
      expect(result.timedOut).toBe(true);
      expect(result.cancelled).toBe(false);
      expect(result.exitCode).toBe(null);
      if (process.platform !== "win32") expect(result.signal).toBe("SIGKILL");

      descendant = Number(
        (await readFile(join(projectRoot, "timeout-child.pid"), "utf8")).trim(),
      );
      expect(Number.isInteger(descendant)).toBe(true);
      await waitUntilStopped(descendant);
    } finally {
      killPid(descendant);
    }
  });

  test("cancels the process group and cleans up descendants", async () => {
    const { runner, projectRoot } = await fixture({
      terminationGraceMs: 1_000,
    });
    await writeFile(
      join(projectRoot, "cancel-fixture.sh"),
      [
        `sh -c 'trap "" TERM; echo $$ > cancel-child.pid; exec sleep 30 >/dev/null 2>&1' &`,
        "echo ready > cancel-ready.txt",
        "wait",
        "",
      ].join("\n"),
    );

    const controller = new AbortController();
    const pending = runCommand(
      runner,
      { command: "sh ./cancel-fixture.sh", timeoutMs: 30_000 },
      { signal: controller.signal },
    );

    let descendant: number | undefined;
    try {
      await waitForFile(join(projectRoot, "cancel-child.pid"));
      await waitForFile(join(projectRoot, "cancel-ready.txt"));
      controller.abort();
      const result = await pending;

      expect(result.status).toBe("cancelled");
      expect(result.started).toBe(true);
      expect(result.cancelled).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.error).toBe(null);

      descendant = Number(
        (await readFile(join(projectRoot, "cancel-child.pid"), "utf8")).trim(),
      );
      expect(Number.isInteger(descendant)).toBe(true);
      await waitUntilStopped(descendant);
    } finally {
      controller.abort();
      await pending.catch(() => {});
      killPid(descendant);
    }
  });

  test("bounds combined output while continuing to drain both streams", async () => {
    const { runner } = await fixture({ maxOutputBytes: 128 });
    const result = await runCommand(runner, {
      command:
        "i=0; while [ $i -lt 100 ]; do printf '0123456789'; i=$((i+1)); done; printf 'ERR' >&2",
      timeoutMs: 5_000,
    });

    expect(result.status).toBe("succeeded");
    expect(result.started).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.outputBytes).toBe(128);
    expect(Buffer.byteLength(result.output)).toBe(128);
    expect(
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
    ).toBe(128);
    expect(result.error).toBe(null);
  });

  test("filters inherited secrets and isolates HOME/TMP in app metadata", async () => {
    const { runner, canonicalMetadataRoot } = await fixture();
    const secrets: Record<string, string> = {
      GRILL_PROJECT_COMMAND_TEST_SECRET: "runner-secret-value-9f3c",
      LLM_API_KEY: "runner-llm-key-9f3c",
      DESKTOP_API_TOKEN: "runner-desktop-token-9f3c",
      OPENCODE_SERVER_PASSWORD: "runner-opencode-password-9f3c",
      HTTPS_PROXY: "http://user:runner-proxy-password@example.invalid:8080",
    };
    const saved = new Map<string, string | undefined>();
    for (const [name, value] of Object.entries(secrets)) {
      saved.set(name, process.env[name]);
      process.env[name] = value;
    }

    try {
      const environment = await runCommand(runner, { command: "env" });
      expect(environment.status).toBe("succeeded");
      for (const [name, value] of Object.entries(secrets)) {
        expect(environment.stdout).not.toContain(value);
        expect(environment.stderr).not.toContain(value);
        expect(environment.stdout).not.toContain(`${name}=`);
      }

      const isolation = await runCommand(runner, {
        command:
          'printf "%s\\n" "$HOME" "$TMPDIR" "$TMP" "$TEMP" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"',
      });
      expect(isolation.status).toBe("succeeded");
      expect(isolation.stderr).toBe("");
      const paths = isolation.stdout.trim().split("\n");
      expect(paths).toHaveLength(6);
      const runRoot = join(canonicalMetadataRoot, "command-runs") + sep;
      for (const path of paths) {
        expect(path.startsWith(runRoot)).toBe(true);
        expect(path).not.toBe(homedir());
        expect(await pathExists(path)).toBe(false);
      }
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
