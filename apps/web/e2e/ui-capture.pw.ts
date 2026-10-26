import { resolve } from "node:path";
import { test, expect, seedProfile } from "./fixtures";

const artifacts = resolve(
  import.meta.dirname,
  "../../../artifacts/ui-revamp/interactions",
);

test("redesigned surfaces retain named controls and fit narrow screens", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seedProfile(page);
  for (const [name, path] of [
    ["home", "/"],
    ["challenges", "/challenges"],
    ["quizzes", "/quizzes"],
    ["preferences", "/preferences"],
    ["history", "/history"],
    ["submit", "/chat?id=build-one&tab=submit"],
    ["logs", "/logs"],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/^Loading/)).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${artifacts}/after-${name}.png`,
      fullPage: true,
    });
  }
  await page.goto("/challenges");
  await page.getByRole("tab", { name: /Saved for later/ }).click();
  await expect(
    page.getByRole("heading", { name: "No saved challenges" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/after-saved.png`,
    fullPage: true,
  });
  await page.goto("/preferences");
  await page
    .getByRole("button", { name: "Import resume", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/after-import.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.goto("/");
  const prompt = page.getByLabel("Describe what you want to build");
  await expect(prompt).toHaveAttribute(
    "placeholder",
    "Describe a topic or something you want to build…",
  );
  await page
    .getByRole("button", { name: "Build scope: Focused", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /Feature/ }).click();
  await expect(
    page.getByRole("button", { name: "Build scope: Feature", exact: true }),
  ).toBeFocused();
  await prompt.fill("Build a React command palette with keyboard navigation");
  await expect(prompt).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Create build", exact: true }),
  ).toBeEnabled();
  await prompt.fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(prompt).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${artifacts}/after-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: `${artifacts}/after-dark.png`,
    fullPage: true,
  });
});
