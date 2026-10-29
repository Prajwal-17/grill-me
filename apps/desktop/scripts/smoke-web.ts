import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, rm, mkdir, writeFile, chmod } from "node:fs/promises";
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
const cliBinary = join(temp, "fixture-codex");
await writeFile(
  cliBinary,
  `#!${process.execPath}\nimport ${JSON.stringify(resolve(root, "apps/desktop/test/fixtures/cli-provider.ts"))};\n`,
);
await chmod(cliBinary, 0o700);
const openCodeBinary = join(temp, "fixture-opencode2");
await writeFile(
  openCodeBinary,
  `#!${process.execPath}\nimport ${JSON.stringify(resolve(root, "apps/desktop/test/fixtures/opencode2-provider.ts"))};\n`,
);
await chmod(openCodeBinary, 0o700);
const [apiPort, webPort, providerPort] = await Promise.all([
  port(),
  port(),
  port(),
]);
let providerStatus = 200;
let failDiscussion = true;
let holdDiscussion = false;
const providerServer = createHttpServer(async (request, response) => {
  if (request.url?.endsWith("/responses")) {
    let raw = "";
    for await (const chunk of request) raw += String(chunk);
    const body = JSON.parse(raw);
    if (body.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Review discussion survives a provider failure." })}\n\n`,
      );
      if (holdDiscussion) return;
      response.end(
        `data: ${JSON.stringify({ type: failDiscussion ? "response.failed" : "response.completed", response: { status: failDiscussion ? "failed" : "completed" } })}\n\n`,
      );
      return;
    }
    const output =
      body.text?.format?.name === "build_preparation"
        ? { question: null, options: [] }
        : {
            status: "ready",
            question: null,
            options: [],
            challenge: {
              title: "Local discussion fixture",
              estimatedDifficultyBand: "medium",
              difficultyReason: "Direct application of known syntax.",
              topic: "TypeScript",
              implementationBoundary: "",
              durationEstimate: { minMinutes: 35, maxMinutes: 50 },
              implementationMilestones: [],
              problemStatement:
                "Build a function that groups words by their first letter.",
              expectedOutcome:
                "A function with deterministic, observable return values.",
              constraints: [],
              starterCode: null,
              completionCriteria: [
                "Returns an empty object for empty input.",
                "Groups repeated first letters without dropping words.",
              ],
            },
          };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "completed",
        output_text: JSON.stringify(output),
        output: [],
      }),
    );
    return;
  }
  response.writeHead(providerStatus, { "content-type": "application/json" });
  response.end(JSON.stringify({ data: [] }));
});
await new Promise<void>((resolve) =>
  providerServer.listen(providerPort, "127.0.0.1", resolve),
);
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
    reducedMotion: "reduce",
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
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();
  const captures = join(root, ".impeccable/review");
  await mkdir(captures, { recursive: true });
  async function selectSection(name: string) {
    const link = page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("link", { name, exact: true });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  async function capture(name: string) {
    await page.mouse.move(1, 1);
    await page.screenshot({
      path: join(captures, name),
      animations: "disabled",
    });
  }
  await selectSection("AI providers");
  await expect(
    page.getByText("No providers configured", { exact: true }),
  ).toBeVisible();
  await capture("settings-empty.png");
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByLabel("Connection type", { exact: true }).click();
  await page
    .getByRole("option", { name: "OpenAI-compatible API", exact: true })
    .click();
  await page
    .getByLabel("Provider name", { exact: true })
    .fill("Standalone provider");
  await page
    .getByLabel("API endpoint", { exact: true })
    .fill(`http://127.0.0.1:${providerPort}/v1`);
  await page
    .getByLabel("API key", { exact: true })
    .fill("web-only-fixture-secret");
  await page.getByRole("button", { name: "Show API key" }).click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide API key" }).click();
  await capture("settings-provider-editor.png");
  await selectSection("Local runtime");
  await selectSection("AI providers");
  await expect(page.getByLabel("Provider name", { exact: true })).toHaveValue(
    "Standalone provider",
  );
  await page.getByLabel("Key storage", { exact: true }).click();
  await page.getByRole("option", { name: "Session only", exact: true }).click();
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(
    page.getByText("Standalone provider", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(
    page.getByText("Connection successful.", { exact: true }),
  ).toBeVisible();
  providerStatus = 401;
  await page
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("HTTP 401");
  await capture("settings-provider-error.png");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add provider", exact: true }),
  ).toBeFocused();
  await page.goto(`http://127.0.0.1:${webPort}`);
  await page.getByLabel("Profile email").fill("web-smoke@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  expect(rpcCalls).toBeGreaterThan(3);
  expect(applicationHttp).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await selectSection("AI providers");
  await expect(
    page.getByText("Standalone provider", { exact: true }),
  ).toBeVisible();
  await capture("settings-providers.png");
  await selectSection("Local runtime");
  await page
    .getByLabel("Projects folder", { exact: true })
    .fill("/tmp/local-review-projects");
  await selectSection("Appearance");
  await selectSection("Local runtime");
  await expect(page.getByLabel("Projects folder", { exact: true })).toHaveValue(
    "/tmp/local-review-projects",
  );
  await capture("settings-runtime-unsaved.png");
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(
    page.getByText("Runtime settings saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Projects folder", { exact: true })).toHaveValue(
    "/tmp/local-review-projects",
  );
  await selectSection("Data & connection");
  await expect(page.getByRole("status")).toContainText("Connected");
  await capture("settings-data.png");
  await selectSection("AI providers");
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByLabel("Connection type", { exact: true }).click();
  await page
    .getByRole("option", { name: "OpenAI-compatible API", exact: true })
    .click();
  const longName =
    "Local provider with a deliberately long name for narrow desktop layouts";
  await page.getByLabel("Provider name", { exact: true }).fill(longName);
  await page
    .getByLabel("API endpoint", { exact: true })
    .fill(`http://127.0.0.1:${providerPort}/v1/${"local-".repeat(24)}`);
  await page
    .getByLabel("Model", { exact: true })
    .fill("local-model-".repeat(12));
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  const secondProvider = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: longName, exact: true }),
  });
  await expect(secondProvider).toBeVisible();
  await secondProvider
    .getByRole("button", { name: "Use provider", exact: true })
    .click();
  await expect(
    secondProvider.getByText("Active", { exact: true }),
  ).toBeVisible();
  await capture("settings-long-providers.png");
  await secondProvider
    .getByRole("button", { name: `More options for ${longName}` })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete provider", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete provider", exact: true })
    .click();
  await expect(secondProvider).toHaveCount(0);
  await page.getByRole("button", { name: "Use provider", exact: true }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "More options for Standalone provider" })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete provider", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await capture("settings-delete.png");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText("Standalone provider", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page
    .getByLabel("Provider name", { exact: true })
    .fill("Connected Codex");
  await page.getByLabel("CLI executable", { exact: true }).fill(cliBinary);
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(
    page.getByText("Sign in to Codex to connect this installation.", {
      exact: true,
    }),
  ).toBeVisible();
  await capture("settings-cli-signin.png");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open sign-in page" }),
  ).toHaveAttribute("href", "https://auth.openai.com/fixture-login");
  await expect(
    page.getByText("Codex is connected.", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByLabel("Model for Connected Codex", { exact: true }).click();
  await page
    .getByRole("option", { name: "Fixture model", exact: true })
    .click();
  await expect(
    page.getByLabel("Model for Connected Codex", { exact: true }),
  ).toContainText("Fixture model");
  await capture("settings-cli-connected.png");
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByLabel("Connection type", { exact: true }).click();
  await page.getByRole("option", { name: "OpenCode CLI", exact: true }).click();
  await page
    .getByLabel("Provider name", { exact: true })
    .fill("Connected OpenCode");
  await page.getByLabel("CLI executable", { exact: true }).fill(openCodeBinary);
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  const openCode = page.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: "Connected OpenCode",
      exact: true,
    }),
  });
  await expect(
    openCode.getByText("Connect an account to use OpenCode models.", {
      exact: true,
    }),
  ).toBeVisible();
  await openCode
    .getByLabel("Account API key", { exact: true })
    .fill("fixture-key");
  await capture("settings-opencode-account.png");
  await openCode.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    openCode.getByText("OpenCode is connected.", { exact: true }),
  ).toBeVisible();
  await capture("settings-opencode-connected.png");
  await selectSection("Appearance");
  await capture("desktop.png");
  await page.setViewportSize({ width: 1920, height: 978 });
  await capture("user-1920.png");

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
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await capture("settings-medium-light.png");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await capture("mobile.png");
  await selectSection("AI providers");
  await page
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", {
        name: "Standalone provider",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await capture("settings-editor-narrow.png");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("API key", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Show API key" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${webPort}`);
  const challenge = (await page.evaluate(async (modulePath) => {
    const { localClient } = await import(/* @vite-ignore */ modulePath);
    const state = Object.values(localStorage)
      .map((value) => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })
      .find(
        (value) => value?.state?.profile?.email === "web-smoke@example.test",
      );
    return localClient().request({
      path: "/challenges/generate",
      method: "POST",
      profileId: state.state.profile.id,
      body: {
        prompt: "Build string grouping in TypeScript",
        scope: "focused",
        difficulty: "medium",
        clarificationContext: null,
      },
    });
  }, `/@fs${root}/packages/ui/src/shared/lib/local-client.ts`)) as {
    id: string;
  };
  await page.goto(`http://127.0.0.1:${webPort}/chat?id=${challenge.id}`);
  await page
    .getByLabel("Ask about this challenge", { exact: true })
    .fill("Can you explain this requirement?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry response", exact: true }),
  ).toBeVisible();
  await capture("discussion-failed.png");
  await page.reload();
  await expect(
    page.getByText("Review discussion survives a provider failure.", {
      exact: true,
    }),
  ).toBeVisible();
  failDiscussion = false;
  await page
    .getByRole("button", { name: "Retry response", exact: true })
    .click();
  await expect(
    page.getByText("Review discussion survives a provider failure.", {
      exact: true,
    }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Stop response", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Can you explain this requirement?", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByText("Review discussion survives a provider failure.", {
      exact: true,
    })
    .last()
    .scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Send message", exact: true })
    .scrollIntoViewIfNeeded();
  await capture("discussion-recovered.png");
  holdDiscussion = true;
  await page
    .getByLabel("Ask about this challenge", { exact: true })
    .fill("Stop this response");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop response", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stop response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry response", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Retry response", exact: true })
    .last()
    .scrollIntoViewIfNeeded();
  await capture("discussion-cancelled.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Ask about this challenge", { exact: true })
    .scrollIntoViewIfNeeded();
  await capture("discussion-narrow.png");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(applicationHttp).toEqual([]);
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
  await new Promise<void>((resolve) => providerServer.close(() => resolve()));
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
