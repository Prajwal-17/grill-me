import { resolve } from "node:path";
import { test, expect, seedProfile } from "./fixtures";

const artifacts = resolve(import.meta.dirname, "../../../artifacts/ui-revamp");

test("palette keeps text, controls, and interaction states readable in both themes", async ({
  page,
}) => {
  await seedProfile(page);
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/challenges");
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      })
      .click();
    const search = page.getByRole("searchbox", { name: "Search challenges" });
    await expect(search).toBeVisible();
    await expect(page.getByText(/^Loading/)).toHaveCount(0);
    const checks = await page.evaluate(() => {
      const rgb = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const luminance = (value: string) =>
        rgb(value)
          .map((v) => {
            const n = v / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const contrast = (a: string, b: string) => {
        const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
        return (hi! + 0.05) / (lo! + 0.05);
      };
      const style = (selector: string) =>
        getComputedStyle(document.querySelector(selector)!);
      const background = (element: Element): string => {
        const color = getComputedStyle(element).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent")
          return color;
        return element.parentElement
          ? background(element.parentElement)
          : "rgb(255, 255, 255)";
      };
      const input = style('[data-slot="input"]');
      const primary = style('[data-slot="page-header"] a');
      const nav = style(
        'nav[aria-label="Main navigation"] [aria-current="page"]',
      );
      const difficulty = style("[data-difficulty]");
      const row = style("ul li a.group");
      const placeholder = getComputedStyle(
        document.querySelector('[data-slot="input"]')!,
        "::placeholder",
      );
      const neutral = (color: string) => {
        const channels = rgb(color);
        return Math.max(...channels) - Math.min(...channels) < 1;
      };
      return {
        originalNeutralIdentity: [
          input.backgroundColor,
          input.color,
          primary.backgroundColor,
          nav.backgroundColor,
        ].every(neutral),
        inputText: contrast(input.color, input.backgroundColor),

        placeholder: contrast(placeholder.color, input.backgroundColor),
        primaryText: contrast(primary.color, primary.backgroundColor),
        selectedNavigation: contrast(nav.color, nav.backgroundColor),
        difficultyText: contrast(
          difficulty.color,
          background(document.querySelector("[data-difficulty]")!),
        ),
        difficultyHasColor:
          difficulty.color !== row.color &&
          difficulty.color !== placeholder.color,
      };
    });
    for (const [name, value] of Object.entries(checks)) {
      if (typeof value === "boolean")
        expect(value, `${theme} ${name}`).toBe(true);
      else expect(value, `${theme} ${name}`).toBeGreaterThanOrEqual(4.5);
    }
    const primary = page
      .locator('[data-slot="page-header"]')
      .getByRole("link", { name: "New build" });
    const restingColor = await primary.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await primary.hover();
    await expect
      .poll(() =>
        primary.evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe(restingColor);
    await page.mouse.move(800, 800);
    const restingBorder = await search.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    await search.hover();
    await expect
      .poll(() => search.evaluate((el) => getComputedStyle(el).borderTopColor))
      .not.toBe(restingBorder);
    await page.mouse.move(800, 800);
    await search.focus();
    await expect(search).toBeFocused();
    // Resting borders are deliberately subtle; keyboard focus must stay distinct.
    await expect
      .poll(() =>
        search.evaluate((el) => {
          const style = getComputedStyle(el);
          const luminance = (color: string) =>
            color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map((v) => {
                const c = v / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
          const [lo, hi] = [
            luminance(style.borderTopColor),
            luminance(style.backgroundColor),
          ].sort((a, b) => a - b);
          return (hi! + 0.05) / (lo! + 0.05);
        }),
      )
      .toBeGreaterThanOrEqual(3);
    await page.screenshot({
      path: `${artifacts}/${theme}-keyboard-focus-desktop.png`,
      animations: "disabled",
    });
    await page.getByRole("combobox", { name: "Challenge difficulty" }).click();
    await expect(
      page.getByRole("option", { name: "Easy", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${artifacts}/${theme}-filter-menu-desktop.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
  }
});
