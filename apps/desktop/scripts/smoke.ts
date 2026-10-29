// Run with xvfb-run -a bun run --cwd apps/desktop test:smoke after desktop:deb.
// Everything, including the Electron profile and mock provider, is disposable.
import { _electron, expect, type ElectronApplication } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";

const root = resolve(import.meta.dir, "..");
const temp = await mkdtemp(join(tmpdir(), "grill-me-desktop-smoke-"));
const dataRoot = join(temp, "grill-me-desktop-dev");
const executable =
  process.env.DESKTOP_SMOKE_EXECUTABLE ??
  join(root, "release/linux-unpacked/grill-me-dev");
const extraction = {
  displayName: null,
  background: [],
  languages: [],
  technologies: [],
  projects: [],
};
const model = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    Response.json({
      id: "desktop-smoke-response",
      status: "completed",
      model: "desktop-smoke",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(extraction),
              annotations: [],
            },
          ],
        },
      ],
    }),
});
let electron: ElectronApplication | undefined;
const diagnostics: string[] = [];
async function launch() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== "ELECTRON_RUN_AS_NODE" && value !== undefined,
    ),
  ) as Record<string, string>;
  electron = await _electron.launch({
    executablePath: executable,
    env: {
      ...env,
      XDG_CONFIG_HOME: temp,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${temp}/no-keyring`,
    },
    args: process.env.CI ? ["--no-sandbox"] : [],
    timeout: 30_000,
  });
  electron
    .process()
    .stderr?.on("data", (data: Buffer) => diagnostics.push(data.toString()));
  electron.on("window", (page) => {
    page.on("console", (message) =>
      diagnostics.push(message.type() + ": " + message.text()),
    );
    page.on("requestfailed", (request) =>
      diagnostics.push(request.url() + " " + request.failure()?.errorText),
    );
    page.on("pageerror", (error) => diagnostics.push(error.message));
  });
  const page = await electron.firstWindow();
  await page.waitForURL("grill-me://app/");
  await page.waitForLoadState("load");
  return page;
}
try {
  await mkdir(dataRoot, { recursive: true });
  await writeFile(
    join(dataRoot, "backend.env"),
    `LLM_BASE_URL=http://127.0.0.1:${model.port}/v1\nLLM_API_KEY=smoke-only\nLLM_MODEL=fixture\nCODEX_BIN=/nonexistent/desktop-smoke-codex\n`,
  );
  let page = await launch();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Use for this session", exact: true })
    .click();
  await expect(
    page.getByText("Imported provider", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to profile" }).click();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", { name: "Choose a profile" }),
  ).toBeVisible();
  expect(page.url()).toBe("grill-me://app/");
  await page.getByLabel("Profile email").fill("desktop-smoke@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a profile" }),
  ).toHaveCount(0);
  const profile = await page.evaluate(async () => {
    const state = JSON.parse(localStorage.getItem("grill-me.app.development")!);
    return state.state.profile as { id: string };
  });
  expect(profile.id).toBeTruthy();
  const saved = await page.evaluate(async (id) => {
    const response = await fetch("/api/profiles/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Profile-Id": id },
      body: JSON.stringify({ displayName: "Desktop Smoke" }),
    });
    return { status: response.status, body: await response.json() };
  }, profile.id);
  expect(saved.status).toBe(200);
  expect(saved.body.data.displayName).toBe("Desktop Smoke");
  for (const format of ["pdf", "docx"]) {
    const bytes = [
      ...(await readFile(
        resolve(root, `../backend/test/fixtures/resume.${format}`),
      )),
    ];
    const result = await page.evaluate(
      async ({ id, bytes, format }) => {
        const data = new FormData();
        data.append(
          "file",
          new File([new Uint8Array(bytes)], `resume.${format}`),
        );
        const response = await fetch("/api/profiles/resume/preview", {
          method: "POST",
          headers: { "X-Profile-Id": id },
          body: data,
        });
        return { status: response.status, body: await response.json() };
      },
      { id: profile.id, bytes, format },
    );
    if (result.status !== 200)
      throw new Error(`Packaged ${format} import: ${JSON.stringify(result)}`);
  }
  const logs = await page.evaluate(async (id) => {
    const response = await fetch("/api/logs", {
      headers: { "X-Profile-Id": id },
    });
    return response.json();
  }, profile.id);
  expect(logs.data.items.length).toBeGreaterThan(0);
  await page.goto(`grill-me://app/logs/${logs.data.items[0].id}`);
  await expect(
    page.getByRole("heading", { name: "Resume import", exact: true }),
  ).toBeVisible();
  await page.goto("grill-me://app/preferences");
  await expect(
    page.getByRole("heading", { name: "Developer profile", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      node: typeof (globalThis as any).require,
      process: typeof (globalThis as any).process,
    })),
  ).toEqual({ node: "undefined", process: "undefined" });
  const pidRows = await electron!.evaluate(({ app }) =>
    app
      .getAppMetrics()
      .filter((row) => row.type === "Browser")
      .map((row) => row.pid),
  );
  expect(pidRows.length).toBeGreaterThan(0);
  await electron!.close();
  electron = undefined;
  const stored = new Database(join(dataRoot, "grill-me.sqlite"), {
    readonly: true,
  });
  expect(stored.query("SELECT email FROM profiles").all()).toEqual([
    { email: "desktop-smoke@example.test" },
  ]);
  stored.close();
  page = await launch();
  await page.goto("grill-me://app/preferences");
  await expect(
    page.getByRole("heading", { name: "Developer profile", exact: true }),
  ).toBeVisible();
  const restored = await page.evaluate(async (id) => {
    const response = await fetch("/api/profiles/preferences", {
      headers: { "X-Profile-Id": id },
    });
    return response.json();
  }, profile.id);
  expect(restored.data.displayName).toBe("Desktop Smoke");
  expect(errors).toEqual([]);
  console.log(
    "Packaged Electron smoke passed: real SQLite profile, saved preferences, PDF/DOCX imports, deep links, sandbox, and restart persistence.",
  );
} catch (error) {
  console.error("Smoke failed:", error);
  console.error(diagnostics.join("\n"));
  try {
    console.error(await readFile(join(dataRoot, "backend.log"), "utf8"));
  } catch {
    /* no backend log yet */
  }
  throw error;
} finally {
  await electron?.close();
  await model.stop(true);
  await rm(temp, { recursive: true, force: true });
}
