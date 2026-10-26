import { resolve } from "node:path";
import { test, expect, seedProfile, challenge } from "./fixtures";

const artifacts = resolve(import.meta.dirname, "../../../artifacts/ui-revamp");

test("local typography loads and reading surfaces survive enlarged text", async ({
  page,
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.woff2(?:\?|$)/.test(request.url())) fontRequests.push(request.url());
  });
  await seedProfile(page);
  await page.route("**/challenges/build-one", (route) =>
    route.fulfill({
      json: {
        data: {
          ...challenge,
          title:
            "Build a resilient request cache with deduplication and expiry",
          problemStatement:
            "## Request caching\n\nImplement a cache that reuses pending requests and expires completed entries. Keep the public API small, and explain how cancellation and failures affect each caller.\n\n### Expected behavior\n\nConcurrent callers should share the same pending request. A rejected request must not remain cached. *Prefer explicit states over implicit timing assumptions.*\n\n```typescript\nasync function readThrough<T>(key: string, load: () => Promise<T>): Promise<T> {\n  return load();\n}\n```",
        },
      },
    }),
  );
  await page.goto("/chat?id=build-one");
  await expect(
    page.getByRole("heading", { name: "Request caching" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      [...document.fonts].some(
        (face) =>
          face.family.includes("Inter Variable") && face.status === "loaded",
      ),
    ),
  ).toBe(true);
  const prose = page.locator(".markdown p").first();
  expect(
    await prose.evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Inter Variable");
  expect(
    await prose.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBe(16);
  const pre = page.locator("pre").first();
  await expect(pre).toBeVisible();
  await page.evaluate(() => document.fonts.load('13px "IBM Plex Mono"'));
  expect(await pre.evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
    "IBM Plex Mono",
  );
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      })
      .click();
    await page.screenshot({
      path: `${artifacts}/${theme}-typography-reading-desktop.png`,
      animations: "disabled",
    });
  }
  for (const route of [
    "/preferences",
    "/quizzes",
    "/challenges",
    "/chat?id=build-one",
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBe(true);
    const field = page
      .locator('[data-slot="input"], [data-slot="textarea"]')
      .first();
    if (await field.isVisible()) {
      expect(
        await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(20);
    }
  }
  await page.screenshot({
    path: `${artifacts}/dark-typography-reading-enlarged-mobile.png`,
    animations: "disabled",
  });
  const appOrigin = new URL(page.url()).origin;
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every((url) => new URL(url).origin === appOrigin)).toBe(
    true,
  );
});
