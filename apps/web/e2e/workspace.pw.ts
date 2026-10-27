import { resolve } from "node:path";
import { test, expect, seedProfile, challenge } from "./fixtures";

const artifacts = resolve(import.meta.dirname, "../../../artifacts/ui-revamp");
const completed = [
  {
    ...challenge,
    id: "alpha",
    number: 2,
    title: "Alpha cache",
    status: "completed",
    scope: "feature",
    completedAt: "2026-03-01T00:00:00Z",
  },
  {
    ...challenge,
    id: "zebra",
    number: 3,
    title: "Zebra parser",
    status: "completed",
    scope: "focused",
    completedAt: "2026-04-01T00:00:00Z",
  },
];

test("history filters and ordering preserve meaningful results", async ({
  page,
}) => {
  await seedProfile(page);
  await page.route("**/challenges/history", (route) =>
    route.fulfill({ json: { data: completed } }),
  );
  await page.goto("/history");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Zebra parser");
  await page.getByRole("combobox", { name: "Sort history" }).click();
  await page.getByRole("option", { name: "Oldest first" }).click();
  await expect(rows.first()).toContainText("Alpha cache");
  await page.getByRole("combobox", { name: "Filter history by scope" }).click();
  await page.getByRole("option", { name: "Feature", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Alpha cache");
  await page
    .getByRole("searchbox", { name: "Search history" })
    .fill("not in history");
  await expect(page.getByText("No builds match your search.")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Zebra parser");
});

test("workspace surfaces render in both themes and fit mobile viewports", async ({
  page,
}) => {
  test.setTimeout(180000);
  await seedProfile(page);
  await page.route("**/challenges/history", (route) =>
    route.fulfill({ json: { data: completed } }),
  );
  const routes = [
    ["home", "/"],
    ["challenges", "/challenges"],
    ["quizzes", "/quizzes"],
    ["preferences", "/preferences"],
    ["history", "/history"],
    ["overview", "/chat?id=build-one"],
    ["submit", "/chat?id=build-one&tab=submit"],
    ["reviews", "/chat?id=build-one&tab=reviews"],
    ["logs", "/logs"],
    ["log-detail", "/logs/log-one"],
  ] as const;
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      })
      .click();
    for (const [name, path] of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText(/^Loading/)).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${artifacts}/${theme}-${name}-desktop.png`,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${theme} ${name} document overflow`,
      ).toBe(true);
      await page.screenshot({
        path: `${artifacts}/${theme}-${name}-mobile.png`,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  }
});

test("populated collections and active quiz retain readable layouts", async ({
  page,
}) => {
  test.setTimeout(120000);
  await seedProfile(page);
  const builds = [
    challenge,
    ...Array.from({ length: 5 }, (_, index) => ({
      ...challenge,
      id: `visual-${index}`,
      number: index + 2,
      title: [
        "Implement an LRU cache with eviction",
        "Build a typed event emitter",
        "Design a rate limiter",
        "Parse nested expressions",
        "Implement optimistic updates with rollback and concurrent request recovery",
      ][index],
      scope: index % 2 ? "system" : "feature",
      difficulty: index % 2 ? "hard" : "easy",
    })),
  ];
  await page.route("**/challenges/active", (route) =>
    route.fulfill({ json: { data: builds } }),
  );
  const quizzes = Array.from({ length: 5 }, (_, index) => ({
    id: `quiz-${index}`,
    challengeId: null,
    number: index + 1,
    title: [
      "JavaScript closures and execution contexts",
      "HTTP caching and conditional requests",
      "React state and effects",
      "Database indexes and query plans",
      "TypeScript inference and discriminated unions",
    ][index],
    topic: "Development",
    prompt: "Practice development concepts",
    difficulty: index % 2 ? "hard" : "medium",
    questionCount: 5,
    coverage: "topic",
    createdAt: "2026-04-01T00:00:00Z",
    latestAttempt:
      index === 0
        ? { number: 1, status: "draft", answered: 1, score: null }
        : index === 1
          ? { number: 1, status: "submitted", answered: 5, score: 4 }
          : null,
  }));
  await page.route(/http:\/\/127\.0\.0\.1:18027\/quizzes(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { data: quizzes } }),
  );
  await page.route("**/quizzes/quiz-0", (route) =>
    route.fulfill({
      json: {
        data: {
          quiz: {
            ...quizzes[0],
            questions: Array.from({ length: 5 }, (_, index) => ({
              id: `question-${index}`,
              question:
                "What does a closure retain after its enclosing function returns?",
              options: [
                "Access to its lexical environment",
                "Only its parameter values",
                "A copy of every global variable",
                "The entire call stack",
              ],
            })),
          },
          attempts: [
            {
              id: "attempt-0",
              quizId: "quiz-0",
              number: 1,
              status: "draft",
              answers: { "question-0": 0 },
              revision: 1,
              score: null,
              createdAt: "2026-04-01T00:00:00Z",
              updatedAt: "2026-04-01T00:00:00Z",
              submittedAt: null,
              results: null,
            },
          ],
        },
      },
    }),
  );
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      })
      .click();
    for (const [name, path] of [
      ["populated-challenges", "/challenges"],
      ["populated-quizzes", "/quizzes"],
    ]) {
      await page.goto(path!);
      await expect(page.getByText(/^Loading/)).toHaveCount(0);
      await expect(page.getByRole("heading").first()).toBeVisible({
        timeout: 15000,
      });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${artifacts}/${theme}-${name}-desktop.png`,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${artifacts}/${theme}-${name}-mobile.png`,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page
      .getByRole("button", { name: "Open quiz #1", exact: true })
      .first()
      .click();
    await expect(
      page.getByText(
        "What does a closure retain after its enclosing function returns?",
      ),
    ).toBeVisible();
    await page.screenshot({
      path: `${artifacts}/${theme}-quiz-attempt-desktop.png`,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${artifacts}/${theme}-quiz-attempt-mobile.png`,
      animations: "disabled",
    });
  }
});
