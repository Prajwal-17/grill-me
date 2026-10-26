import { resolve } from "node:path";
import { test, expect, seedProfile } from "./fixtures";

const artifacts = resolve(import.meta.dirname, "../../../artifacts/ui-revamp");
test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });

test("pointer overlays keep stable anchors, quick exits, and interrupt cleanly", async ({
  page,
}) => {
  await seedProfile(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/challenges");
  const trigger = page.getByRole("button", {
    name: "Appearance",
    exact: true,
    includeHidden: true,
  });
  const resting = await trigger.boundingBox();
  await trigger.hover();
  await page.mouse.down();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  expect(await trigger.boundingBox()).toEqual(resting);
  await expect(trigger).toHaveCSS("transform", "none");
  await page.mouse.up();
  await expect(menu).toHaveCSS("animation-name", "ui-overlay-in");
  await expect(menu).toHaveCSS("animation-duration", "0.16s");
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(menu).toHaveCount(0);

  const difficulty = page.getByRole("combobox", {
    name: "Challenge difficulty",
    includeHidden: true,
  });
  await difficulty.click();
  const select = page.locator('[data-slot="select-content"]');
  await expect(select).toHaveCSS("animation-name", "ui-overlay-in");
  await expect(difficulty.locator(".motion-chevron")).toHaveCSS(
    "transform",
    "matrix(-1, 0, 0, -1, 0, 0)",
  );
  await page.screenshot({
    path: `${artifacts}/motion-filter-desktop.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(difficulty).toBeFocused();
  await expect(select).toHaveCount(0);
  // Reopening while the previous exit is still running must not strand a portal.
  for (let i = 0; i < 3; i++) {
    await difficulty.click();
    await page.keyboard.press("Escape");
  }
  await expect(select).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");

  await page.goto("/preferences");
  const importer = page.getByRole("button", {
    name: "Import resume",
    exact: true,
  });
  await importer.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("animation-duration", "0.18s");
  await page.screenshot({
    path: `${artifacts}/motion-dialog-desktop.png`,
    animations: "disabled",
  });
  // Record the actual CSS exit at animationstart rather than racing its 120ms lifetime.
  await page.evaluate(() => {
    document.addEventListener("animationstart", (event) => {
      const animation = event as AnimationEvent;
      if (animation.animationName === "ui-overlay-out") {
        document.documentElement.dataset.lastExitDuration = getComputedStyle(
          animation.target as Element,
        ).animationDuration;
      }
    });
  });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-last-exit-duration",
    "0.12s",
  );
  await expect(importer).toBeFocused();
});

test("keyboard and reduced-motion paths preserve feedback without movement", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedProfile(page);
  await page.goto("/challenges");
  const difficulty = page.getByRole("combobox", {
    name: "Challenge difficulty",
    includeHidden: true,
  });
  await difficulty.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-slot="select-content"]')).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.keyboard.press("Escape");
  await expect(difficulty).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await difficulty.click();
  await expect(page.locator('[data-slot="select-content"]')).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.keyboard.press("Escape");
  await page.goto("/preferences");
  const importer = page.getByRole("button", {
    name: "Import resume",
    exact: true,
  });
  await importer.click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(importer).toBeFocused();

  await page.goto("/chat?id=build-one");
  const copy = page.getByRole("button", {
    name: "Copy challenge",
    exact: true,
  });
  await expect(copy).toBeVisible();
  const width = (await copy.boundingBox())!.width;
  await copy.click();
  await expect(copy.getByText("Copied", { exact: true })).toBeVisible();
  expect((await copy.boundingBox())!.width).toBe(width);
  await expect(copy.locator(".feedback-check")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Group",
  );
  await expect(copy.getByText("Copy challenge", { exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await copy.click();
  await expect(copy.locator(".feedback-check")).toHaveCSS(
    "animation-name",
    "ui-check-in",
  );
  await page.screenshot({
    path: `${artifacts}/motion-copy-desktop.png`,
    animations: "disabled",
  });
});

test("mobile sheets and final attachment removal settle without leftover UI", async ({
  page,
}) => {
  await seedProfile(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/challenges");
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await toggle.click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toHaveCSS("animation-duration", "0.2s");
  await page.screenshot({
    path: `${artifacts}/motion-sidebar-mobile.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle.click();
  await expect(sheet).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("http://127.0.0.1:18027/uploads", (route) =>
    route.fulfill({ json: { data: { id: "motion-upload" } } }),
  );
  await page.route(
    "http://127.0.0.1:18027/uploads/motion-upload/chunks",
    (route) => route.fulfill({ json: { data: {} } }),
  );
  await page.goto("/chat?id=build-one&tab=submit");
  await page.getByLabel("Attach source files").setInputFiles({
    name: "cache.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export const cache = new Map();"),
  });
  const remove = page.getByRole("button", {
    name: "Remove cache.ts",
    exact: true,
  });
  await expect(remove).toBeVisible();
  const uploads = page.locator("ul").filter({ has: remove });
  await expect(uploads).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/motion-attachment-mobile.png`,
    animations: "disabled",
  });
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(page.locator("ul.empty\\:hidden")).toBeHidden();
  // Removing from the keyboard must use the current modality even on the
  // exiting Motion child, which is absent from the next React render.
  await page.getByLabel("Attach source files").setInputFiles({
    name: "cache.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export const cache = new Map();"),
  });
  await expect(remove).toBeVisible();
  await remove.focus();
  await page.keyboard.press("Tab");
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(remove).toHaveCount(0);
  await expect(page.locator("ul.empty\\:hidden")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
