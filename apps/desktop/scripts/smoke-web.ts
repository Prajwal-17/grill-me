import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
async function port() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((r) => server.close(() => r()));
  return address.port;
}
const root = resolve(import.meta.dirname, "../../..");
const temp = await mkdtemp(join(tmpdir(), "grill-web-smoke-"));
const [apiPort, webPort] = await Promise.all([port(), port()]);
const child = spawn(process.execPath, ["run", "dev:web"], {
  cwd: root,
  detached: true,
  env: {
    ...process.env,
    GRILL_LOCAL_HOME: temp,
    LOCAL_BACKEND_PORT: String(apiPort),
    LOCAL_WEB_PORT: String(webPort),
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${temp}/no-keyring`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Standalone dev startup timed out")),
      30000,
    );
    const append = (data: Buffer) => {
      output = (output + data.toString()).slice(-20000);
      if (
        output.includes("Local SQLite backend ready") &&
        output.includes(`http://127.0.0.1:${webPort}/`)
      ) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", reject);
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Standalone launcher exited"));
    });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  const applicationHttp: string[] = [];
  let rpcCalls = 0;
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Page error:", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Browser:", message.text());
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      applicationHttp.push(request.url());
  });
  page.on("websocket", (socket) =>
    socket.on("framesent", (event) => {
      if (String(event.payload).includes('"type":"request"')) rpcCalls++;
    }),
  );
  await page.goto(`http://127.0.0.1:${webPort}`);
  await expect(
    page.getByRole("group", { name: "Window controls" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Application settings" }),
  ).toBeVisible();
  await expect(page.getByText("No providers configured.")).toBeVisible();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page
    .getByLabel("Provider name", { exact: true })
    .fill("Standalone provider");
  await page
    .getByLabel("API key", { exact: true })
    .fill("web-only-fixture-secret");
  await page.getByLabel("Key storage", { exact: true }).click();
  await page.getByRole("option", { name: "Session only", exact: true }).click();
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(
    page.getByText("Standalone provider", { exact: true }),
  ).toBeVisible();
  await page.goto(`http://127.0.0.1:${webPort}`);
  await page.getByLabel("Profile email").fill("web-smoke@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  expect(rpcCalls).toBeGreaterThan(3);
  expect(applicationHttp).toEqual([]);
  expect(errors).toEqual([]);
  const captures = join(root, ".data");
  await mkdir(captures, { recursive: true });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("Standalone provider", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: join(captures, "standalone-settings.png") });

  await page.setViewportSize({ width: 900, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Appearance", exact: true })
    .last()
    .click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await page.screenshot({
    path: join(captures, "standalone-settings-light.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(captures, "standalone-settings-narrow.png"),
  });
  console.log(
    "Standalone source smoke passed: settings before profile, provider save, profile creation, and application requests over WebSocket.",
  );
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages()) {
      console.error(
        "Failed page:",
        page.url(),
        await page
          .locator("body")
          .innerText()
          .catch(() => "unavailable"),
      );
    }
  console.error(output);
  throw error;
} finally {
  await browser?.close();
  if (child.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* stopped */
    }
    await new Promise<void>((r) => {
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* stopped */
        }
        r();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        r();
      });
    });
  }
  await rm(temp, { recursive: true, force: true });
}
