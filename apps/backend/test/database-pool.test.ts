import { expect, test } from "bun:test";
import { databaseUrl } from "../../../packages/backend/src/shared/storage/paths";

test("reloading database modules reuses a connection pool instead of exhausting PostgreSQL", async () => {
  const moduleUrl = new URL(
    "../../../packages/backend/src/shared/database/db.ts",
    import.meta.url,
  ).href;
  const child = Bun.spawn(
    [
      "bun",
      "-e",
      `
    const pids = new Set();
    let client;
    for (let reload = 0; reload < 20; reload++) {
      const { db } = await import(${JSON.stringify(moduleUrl)} + "?reload=" + reload);
      client = db.$client;
      const rows = await client.unsafe("SELECT pg_backend_pid() AS pid");
      pids.add(rows[0].pid);
    }
    console.log(pids.size);
    await client.close();
  `,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? databaseUrl(),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [output, error, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(status).toBe(0);
  expect(output.trim()).toBe("1");
});
