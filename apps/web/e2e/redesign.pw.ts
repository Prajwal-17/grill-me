import type { Page } from "@playwright/test";
import { resolve } from "node:path";
import {
  test,
  expect,
  seedProfile,
  challenge,
  preferences,
  profile,
} from "./fixtures";
import type { Challenge, ProfilePreferences } from "../src/shared/types/api";
import type { QuizSummary, QuizAttempt } from "../src/features/quizzes/types";

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const builds: Challenge[] = [
  {
    ...challenge,
    id: "queue",
    number: 3,
    title: "Queue service",
    topic: "Queues",
    scope: "system",
    difficulty: "hard",
    contextualDifficulty: "hard",
    createdAt: "2026-03-01T00:00:00Z",
  },
  {
    ...challenge,
    id: "cache",
    number: 2,
    title: "Atomic cache",
    topic: "Caching",
    scope: "feature",
    difficulty: "easy",
    contextualDifficulty: "easy",
    createdAt: "2026-02-01T00:00:00Z",
  },
  {
    ...challenge,
    id: "worker",
    number: 1,
    title: "Worker pool",
    topic: "Concurrency",
    scope: "focused",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const quizzes: QuizSummary[] = [
  {
    id: "quiz-1",
    challengeId: null,
    number: 1,
    title: "Queue fundamentals",
    topic: "Queues",
    prompt: "Queues",
    difficulty: "hard",
    questionCount: 5,
    coverage: "topic",
    createdAt: "2026-03-01T00:00:00Z",
    latestAttempt: null,
  },
  {
    id: "quiz-2",
    challengeId: null,
    number: 2,
    title: "Atomic operations",
    topic: "Concurrency",
    prompt: "Concurrency",
    difficulty: "easy",
    questionCount: 5,
    coverage: "topic",
    createdAt: "2026-02-01T00:00:00Z",
    latestAttempt: { number: 1, status: "submitted", answered: 5, score: 4 },
  },
  {
    id: "quiz-3",
    challengeId: null,
    number: 3,
    title: "Queue recovery",
    topic: "Queues",
    prompt: "Queues",
    difficulty: "hard",
    questionCount: 5,
    coverage: "topic",
    createdAt: "2026-01-01T00:00:00Z",
    latestAttempt: { number: 1, status: "draft", answered: 2, score: null },
  },
];

test("successful inline quiz generation moves keyboard focus to Start quiz", async ({
  page,
}) => {
  await seedProfile(page);
  const generated = {
    ...quizzes[0]!,
    id: "generated-quiz",
    title: "Generated queue quiz",
    questions: Array.from({ length: 5 }, (_, index) => ({
      id: `q-${index}`,
      question: `Question ${index + 1}`,
      options: ["A", "B", "C", "D"],
    })),
  };
  let created = false;
  await page.route("http://127.0.0.1:18027/quizzes?*", (route) =>
    route.fulfill({ json: { data: created ? [generated] : [] } }),
  );
  await page.route("http://127.0.0.1:18027/quizzes/generate", (route) => {
    created = true;
    return route.fulfill({ json: { data: generated } });
  });
  await page.route("http://127.0.0.1:18027/quizzes/generated-quiz", (route) =>
    route.fulfill({ json: { data: { quiz: generated, attempts: [] } } }),
  );
  await page.goto("/quizzes");
  await page
    .getByRole("button", { name: "Generate quiz", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Quiz prompt" })
    .fill("Queues and retries");
  await page
    .getByRole("button", { name: "Generate quiz", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Generated queue quiz" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start quiz", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      "../../../artifacts/ui-revamp/quiz-generation-focus.png",
    ),
    animations: "disabled",
  });
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`challenge search, filters, sorting and completed collection at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seedProfile(page);
    await page.route("http://127.0.0.1:18027/challenges/active", (route) =>
      route.fulfill({ json: { data: builds } }),
    );
    const completed = Array.from({ length: 6 }, (_, index) => ({
      ...challenge,
      id: `completed-${index}`,
      number: index + 10,
      title: `Completed build ${index}`,
      status: "completed",
      completedAt: challenge.createdAt,
    }));
    await page.route("http://127.0.0.1:18027/challenges/history", (route) =>
      route.fulfill({ json: { data: completed } }),
    );
    await page.goto("/challenges");
    await expect(
      page.getByRole("tab", { name: "In progress 3" }),
    ).toBeVisible();
    const panel = page.getByRole("tabpanel");
    await choose(page, "Sort challenges", "Name A–Z");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText([
      "#2Atomic cache",
      "#3Queue service",
      "#1Worker pool",
    ]);
    await page
      .getByRole("searchbox", { name: "Search challenges" })
      .fill("queue");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText([
      "#3Queue service",
    ]);
    await choose(page, "Challenge type", "Focused");
    await expect(
      page.getByText("No challenges found", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await choose(page, "Challenge difficulty", "Easy");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText([
      "#2Atomic cache",
    ]);
    await choose(page, "Challenge difficulty", "Any difficulty");
    await page.getByRole("tab", { name: "Completed 6", exact: true }).click();
    await expect(
      panel.getByRole("link", { name: /Completed build/ }),
    ).toHaveCount(6);
    await expect(
      panel.getByRole("link", { name: /Completed build 0/ }),
    ).toHaveAttribute("href", "/history?id=completed-0");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("quiz controls compose, keep URL and storage state, and survive inline creation", async ({
  page,
}) => {
  await seedProfile(page);
  await page.route("http://127.0.0.1:18027/quizzes?*", (route) =>
    route.fulfill({ json: { data: quizzes } }),
  );
  await page.goto("/quizzes?extra=keep#library");
  const open = page.getByRole("button", { name: /^Open quiz/ });
  const generate = page
    .locator('[data-slot="page-header"]')
    .getByRole("button", { name: "Generate quiz", exact: true });
  await expect(generate).toBeVisible();
  await choose(page, "Sort quizzes", "Name A–Z");
  await expect(open).toHaveText([
    "Atomic operations",
    "Queue fundamentals",
    "Queue recovery",
  ]);
  await page.getByRole("searchbox", { name: "Search quizzes" }).fill("queue");
  await choose(page, "Filter by difficulty", "Hard");
  await choose(page, "Quiz status", "In progress");
  await expect(open).toHaveCount(1);
  await expect(open).toHaveAttribute("aria-label", "Open quiz #3");
  await expect(page).toHaveURL(
    /extra=keep.*quizSearch=queue.*quizStatus=draft.*quizDifficulty=hard.*quizSort=name.*#library$/,
  );
  await generate.click();
  await expect(
    page.getByRole("textbox", { name: "Quiz prompt" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Quiz prompt" })
    .fill("Distributed transactions");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(generate).toBeFocused();
  await expect(open).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search quizzes" }),
  ).toHaveValue("queue");
  await expect(open).toHaveAttribute("aria-label", "Open quiz #3");
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem(`grill-me.quiz-library.test.${id}`)!)
          .sort,
      profile.id,
    ),
  ).toBe("name");
  await page
    .getByRole("searchbox", { name: "Search quizzes" })
    .fill("no match");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(open).toHaveCount(3);
});

test("inline quiz creation keeps an active attempt and its autosave registered", async ({
  page,
}) => {
  await seedProfile(page);
  const quiz = {
    ...quizzes[0]!,
    questions: Array.from({ length: 5 }, (_, index) => ({
      id: `q${index}`,
      question: `Question ${index + 1}?`,
      options: ["First", "Second", "Third", "Fourth"],
    })),
  };
  let attempt: QuizAttempt = {
    id: "attempt-one",
    quizId: quiz.id,
    number: 1,
    status: "draft",
    answers: {},
    revision: 0,
    score: null,
    createdAt: quiz.createdAt,
    updatedAt: quiz.createdAt,
    submittedAt: null,
    results: null,
  };
  let saves = 0;
  await page.route("http://127.0.0.1:18027/quizzes?*", (route) =>
    route.fulfill({ json: { data: quizzes } }),
  );
  await page.route("http://127.0.0.1:18027/quizzes/quiz-1", (route) =>
    route.fulfill({ json: { data: { quiz, attempts: [attempt] } } }),
  );
  await page.route(
    "http://127.0.0.1:18027/quizzes/quiz-1/attempts/attempt-one/answers",
    (route) => {
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(attempt.revision);
      attempt = {
        ...attempt,
        answers: body.answers,
        revision: attempt.revision + 1,
      };
      saves++;
      return route.fulfill({ json: { data: attempt } });
    },
  );
  await page.goto("/quizzes");
  await page.getByRole("button", { name: "Open quiz #1", exact: true }).click();
  await page.getByText("First", { exact: true }).click();
  await page
    .getByRole("button", { name: "Generate quiz", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "First", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "All quizzes", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
  expect(attempt.answers).toEqual({ q0: 0 });
});

test("preference sections keep edits and save every section together on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedProfile(page);
  let stored = preferences;
  let payload: Partial<ProfilePreferences> | undefined;
  await page.route("http://127.0.0.1:18027/profiles/preferences", (route) => {
    if (route.request().method() === "POST") {
      payload = route.request().postDataJSON();
      stored = { ...stored, ...payload };
    }
    return route.fulfill({ json: { data: stored } });
  });
  await page.goto("/preferences");
  const nav = page.getByRole("navigation", { name: "Preference sections" });
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Sam Developer");
  await page
    .getByRole("textbox", { name: "Background", exact: true })
    .fill("Building storage systems");
  await nav.getByRole("button", { name: "Practice", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Learning goal", exact: true })
    .fill("Write reliable queues");
  await page
    .getByRole("textbox", { name: "Known concepts", exact: true })
    .fill(" Maps \n\n Queues ");
  await nav.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Task queue");
  await page
    .getByRole("textbox", { name: "Technologies" })
    .fill("TypeScript, , Redis");
  await page
    .getByRole("textbox", { name: "Your contribution", exact: true })
    .fill("Implemented retry handling");
  await nav.getByRole("button", { name: "Code reviews", exact: true }).click();
  await page.getByLabel("Codex model", { exact: true }).fill("test-model");
  await nav.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Sam Developer");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByText("Preferences saved", { exact: true }),
  ).toBeVisible();
  expect(payload).toMatchObject({
    displayName: "Sam Developer",
    aboutMe: "Building storage systems",
    learningGoal: "Write reliable queues",
    knownConcepts: ["Maps", "Queues"],
    codexModel: "test-model",
    projects: [
      {
        name: "Task queue",
        technologies: ["TypeScript", "Redis"],
        contribution: "Implemented retry handling",
      },
    ],
  });
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Sam Developer");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("saving reveals invalid hidden preference sections before sending a request", async ({
  page,
  apiRequests,
}) => {
  await seedProfile(page);
  await page.goto("/preferences");
  const nav = page.getByRole("navigation", { name: "Preference sections" });
  await nav.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await nav.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    nav.getByRole("button", { name: "Projects", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Queue");
  await page
    .getByRole("textbox", { name: "Your contribution", exact: true })
    .fill("Built it");
  await nav.getByRole("button", { name: "Code reviews", exact: true }).click();
  await page.getByLabel("Codex model", { exact: true }).fill("");
  await nav.getByRole("button", { name: "Practice", exact: true }).click();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByLabel("Codex model", { exact: true })).toBeFocused();
  expect(
    apiRequests.filter((path) => path === "/profiles/preferences"),
  ).toHaveLength(1);
});

test("preference save errors preserve drafts and allow retry", async ({
  page,
}) => {
  await seedProfile(page);
  let attempts = 0;
  await page.route("http://127.0.0.1:18027/profiles/preferences", (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ json: { data: preferences } });
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "UNAVAILABLE",
            message: "Settings could not be saved. Try again.",
            retryable: true,
          },
        },
      });
    return route.fulfill({
      json: { data: { ...preferences, ...route.request().postDataJSON() } },
    });
  });
  await page.goto("/preferences");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Keep this draft");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Settings could not be saved",
  );
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Keep this draft");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByText("Preferences saved", { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});
