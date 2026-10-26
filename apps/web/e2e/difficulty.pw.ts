import { resolve } from "node:path";
import { test, expect, seedProfile, challenge } from "./fixtures";

const artifacts = resolve(import.meta.dirname, "../../../artifacts/ui-revamp");

test("difficulty columns align numeric and named levels without cramped badges", async ({
  page,
}) => {
  await seedProfile(page);
  const levels = [
    ["medium", 5],
    ["grill", 9],
    ["medium", 4],
    ["easy", 2],
    ["easy", null],
    ["grill", null],
    ["hard", null],
    ["medium", null],
  ] as const;
  await page.route("**/challenges/active", (route) =>
    route.fulfill({
      json: {
        data: levels.map(([difficulty, score], index) => ({
          ...challenge,
          id: `difficulty-${index}`,
          number: index + 1,
          title: [
            "Build a request cache",
            "Implement a query planner",
            "Group incoming events",
            "Parse a URL",
            "Filter a collection",
            "Build a task scheduler",
            "Coordinate concurrent workers",
            "Design a rate limiter",
          ][index],
          difficulty,
          contextualDifficulty: difficulty,
          estimatedDifficultyScore: score,
        })),
      },
    }),
  );
  await page.goto("/challenges");
  for (const theme of ["dark", "light"]) {
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", {
        name: theme === "dark" ? "Dark" : "Light",
        exact: true,
      })
      .click();
    await page.setViewportSize({ width: 1280, height: 900 });
    const indicators = page.locator("[data-difficulty]");
    await expect(indicators).toHaveCount(8);
    const geometry = await indicators.evaluateAll((elements) =>
      elements.map((el) => ({
        x: el.getBoundingClientRect().x,
        background: getComputedStyle(el).backgroundColor,
        border: getComputedStyle(el).borderTopColor,
        gap: getComputedStyle(el).columnGap,
        icon: el.querySelector("svg")!.getBoundingClientRect().width,
      })),
    );
    for (const item of geometry) {
      expect(item.x).toBe(geometry[0]!.x);
      expect(item.background).toBe("rgba(0, 0, 0, 0)");
      expect(item.border).toBe("rgba(0, 0, 0, 0)");
      expect(item.gap).toBe("6px");
      expect(item.icon).toBe(14);
    }
    await page
      .locator("ul")
      .filter({ has: indicators })
      .screenshot({
        path: `${artifacts}/difficulty-${theme}-desktop.png`,
        animations: "disabled",
      });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${artifacts}/difficulty-${theme}-mobile.png`,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});
