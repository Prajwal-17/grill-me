// Runs all ordinary tests against a disposable PostgreSQL instance.
// No paid provider calls. Existing databases and containers are never changed.
const name = "grill-me-test-" + crypto.randomUUID().slice(0, 8);
async function docker(args: string[]) {
  const process = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, error, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code) throw new Error(error.trim() || `docker exited ${code}`);
  return output.trim();
}
let started = false;
try {
  await docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-e",
    "POSTGRES_USER=grill_test",
    "-e",
    "POSTGRES_PASSWORD=isolated-test-only",
    "-e",
    "POSTGRES_DB=grill-me-test",
    "-p",
    "127.0.0.1::5432",
    "postgres:17-alpine",
    "-c",
    "max_connections=60",
  ]);
  started = true;
  const port = (await docker(["port", name, "5432/tcp"])).split(":").at(-1)!;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      await docker([
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "grill_test",
        "-d",
        "grill-me-test",
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready)
    throw new Error("The isolated PostgreSQL instance did not become ready.");
  const url = `postgresql://grill_test:isolated-test-only@127.0.0.1:${port}/grill-me-test`;
  const tests = Bun.spawn(
    ["bun", "test", "--timeout", "15000", ...process.argv.slice(2)],
    {
      env: {
        ...process.env,
        APP_ENV: "test",
        DATABASE_URL: url,
        TEST_DATABASE_URL: url,
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const stop = () => tests.kill("SIGINT");
  process.on("SIGINT", stop);
  process.exitCode = await tests.exited;
  process.off("SIGINT", stop);
} finally {
  if (started) await docker(["rm", "-f", name]);
}
export {};
