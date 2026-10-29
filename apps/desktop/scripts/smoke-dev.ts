// Exercises the actual source-mode launcher; no standalone or package build.
import { chromium, expect, type Browser } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test port available");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

const root = resolve(import.meta.dirname, "../../..");
const temp = await mkdtemp(join(tmpdir(), "grill-me-dev-ui-"));
const [debugPort, apiPort] = await Promise.all([
  availablePort(),
  availablePort(),
]);
const child = spawn(process.execPath, ["run", "dev"], {
  cwd: root,
  detached: true,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: temp,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${temp}/no-keyring`,
    REMOTE_DEBUGGING_PORT: String(debugPort),
    DESKTOP_DEV_API_PORT: String(apiPort),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let browser: Browser | undefined;
try {
  const endpoint = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Devtools startup timed out")),
      30_000,
    );
    const append = (data: Buffer) => {
      output = (output + data.toString()).slice(-16000);
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]!);
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Dev launcher exited (${code})`));
    });
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0]!;
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Renderer error:", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Renderer:", message.text());
  });
  await expect(
    page.getByRole("heading", { name: "Choose a profile" }),
  ).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const styles = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const card = document.querySelector("main > section")!;
    const logo = document.querySelector("header img")!;
    const email = document.querySelector("#email")!;
    return {
      layout: getComputedStyle(main).display,
      direction: getComputedStyle(main).flexDirection,
      font: getComputedStyle(document.body).fontFamily,
      cardWidth: card.getBoundingClientRect().width,
      cardX: card.getBoundingClientRect().x,
      viewport: innerWidth,
      logoWidth: logo.getBoundingClientRect().width,
      inputHeight: email.getBoundingClientRect().height,
    };
  });
  console.log("Dev renderer styles:", styles);
  expect(styles.layout).toBe("flex");
  expect(styles.direction).toBe("column");
  expect(styles.font).toContain("Inter Variable");
  expect(styles.cardWidth).toBe(420);
  expect(
    Math.abs(styles.cardX - (styles.viewport - styles.cardWidth) / 2),
  ).toBeLessThan(2);
  expect(styles.logoWidth).toBe(28);
  // Desktop inputs intentionally use the component's md:h-9 compact size.
  expect(styles.inputHeight).toBe(36);
  const captures = resolve(root, ".data");
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: join(captures, "desktop-dev-profile.png") });
  await page.getByLabel("Profile email").fill("dev-styling@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  expect(
    await page
      .locator("#desktop-sidebar")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(232);
  await page.screenshot({ path: join(captures, "desktop-dev-smoke.png") });

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Application settings" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page
    .getByLabel("Provider name", { exact: true })
    .fill("Smoke local provider");
  await page.getByLabel("Model", { exact: true }).fill("smoke-model");
  await page.getByLabel("API key", { exact: true }).fill("source-smoke-secret");
  await page.getByLabel("Key storage", { exact: true }).click();
  await page.getByRole("option", { name: "Session only", exact: true }).click();
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(
    page.getByText("Smoke local provider", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Key available for this session", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator("output")).toHaveText("110%");
  await page.keyboard.press("Control+0");
  await expect(page.locator("output")).toHaveText("100%");
  await page.keyboard.press("Control+Equal");
  await expect(page.locator("output")).toHaveText("110%");
  await page.keyboard.press("Control+Minus");
  await expect(page.locator("output")).toHaveText("100%");
  await page.getByLabel("Startup window mode").click();
  await page.getByRole("option", { name: "Maximized", exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse(
          await readFile(
            join(temp, "grill-me-desktop-dev/desktop-settings.json"),
            "utf8",
          ),
        ).startup,
    )
    .toBe("maximized");
  await page.reload();
  await expect(
    page.getByText("Smoke local provider", { exact: true }),
  ).toBeVisible();
  const persisted = await page.evaluate(() => JSON.stringify(localStorage));
  expect(persisted).not.toContain("source-smoke-secret");
  const metadata = await readFile(
    join(temp, "grill-me-desktop-dev/settings.sqlite"),
  );
  expect(metadata.includes("source-smoke-secret")).toBe(false);
  await page.screenshot({ path: join(captures, "desktop-settings.png") });
  expect(errors).toEqual([]);
  console.log(
    "Dev renderer smoke passed: styled profile screen, fonts, sizing, SQLite login, and sidebar layout.",
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await browser?.close();
  if (child.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGINT");
    } catch {
      /* already stopped */
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* already stopped */
        }
        resolve();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  await rm(temp, { recursive: true, force: true });
}
