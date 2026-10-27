import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  seedProfile,
  profile,
  makeGenerationJob,
} from "./fixtures";
import type {
  GenerationJob,
  GenerationRequest,
} from "../src/features/generations/types";

const artifacts = "/tmp/grill-me-background-generation-qa";
async function mockJobs(page: Page) {
  const jobs: GenerationJob[] = [];
  const answers: { question: string; answer: string }[] = [];
  let retries = 0;
  await page.route("**/generation-jobs**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 1) {
      if (route.request().method() === "GET")
        return route.fulfill({ json: { data: jobs } });
      const request = route.request().postDataJSON() as GenerationRequest;
      const job = makeGenerationJob(request, {
        status: "running",
        phase: request.kind === "challenge" ? "preparing" : "generating",
        completedAt: null,
        resultId: null,
        resultTitle: null,
        resultNumber: null,
      });
      jobs.push(job);
      return route.fulfill({ status: 202, json: { data: job } });
    }
    const job = jobs.find((job) => job.id === parts[1]);
    if (!job)
      return route.fulfill({
        status: 404,
        json: {
          error: {
            code: "GENERATION_NOT_FOUND",
            message: "Generation not found.",
            retryable: false,
          },
        },
      });
    if (parts[2] === "cancel") {
      Object.assign(job, {
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      });
      return route.fulfill({ json: { data: job } });
    }
    if (parts[2] === "acknowledge") {
      const receipt = route.request().postDataJSON();
      if (receipt.status === job.status && receipt.updatedAt === job.updatedAt)
        job.notifiedAt = new Date().toISOString();
      return route.fulfill({ json: { data: { acknowledged: true } } });
    }
    if (parts[2] === "retry" || parts[2] === "answer") {
      if (parts[2] === "retry") retries++;
      else answers.push(route.request().postDataJSON());
      Object.assign(job, {
        status: "running",
        phase: "generating",
        clarification: null,
        error: null,
        notifiedAt: null,
        updatedAt: new Date().toISOString(),
      });
      return route.fulfill({ status: 202, json: { data: job } });
    }
    return route.fulfill({ json: { data: job } });
  });
  return {
    jobs,
    answers,
    retries: () => retries,
    update(job: GenerationJob, values: Partial<GenerationJob>) {
      Object.assign(job, values, {
        updatedAt: new Date().toISOString(),
        notifiedAt: null,
      });
    },
    complete(job: GenerationJob) {
      Object.assign(job, {
        status: "completed",
        phase: "completed",
        resultId: job.kind === "challenge" ? "build-one" : "background-quiz",
        resultTitle:
          job.kind === "challenge" ? "Group words" : "Background quiz",
        resultNumber: 1,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifiedAt: null,
      });
    },
  };
}
async function createChallenge(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Describe what you want to build")
    .fill("Practice TypeScript grouping");
  await page.getByRole("button", { name: "Create build", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Generation progress" }),
  ).toBeVisible();
}

test("challenge generation stays active across navigation and reload, then opens only from its toast", async ({
  page,
}) => {
  await seedProfile(page);
  const server = await mockJobs(page);
  await createChallenge(page);
  await expect(
    page.getByLabel("Describe what you want to build"),
  ).toBeEnabled();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Notifications, 1 generating/ }),
  ).toBeVisible();
  server.complete(server.jobs[0]!);
  await expect(
    page.getByRole("button", { name: "Open challenge", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page).toHaveURL(/\/history$/);
  await page
    .getByRole("button", { name: "Open challenge", exact: true })
    .click();
  await expect(page).toHaveURL(/\/chat\?id=build-one$/);
  await expect(
    page.getByRole("heading", { name: "#1 Group words", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open challenge", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(
    page.getByRole("link", { name: "Open challenge", exact: true }),
  ).toBeVisible();
  expect(server.jobs).toHaveLength(1);
});

for (const challengeQuiz of [false, true]) {
  test(`${challengeQuiz ? "challenge" : "standalone"} quiz completes on another page and opens the exact saved quiz`, async ({
    page,
  }) => {
    await seedProfile(page);
    const server = await mockJobs(page);
    const quiz = {
      id: "background-quiz",
      challengeId: challengeQuiz ? "build-one" : null,
      title: "Background quiz",
      number: 1,
      topic: "Queues",
      prompt: "Queues",
      difficulty: "medium",
      questionCount: 10,
      coverage: challengeQuiz ? "mixed" : "topic",
      createdAt: new Date().toISOString(),
      latestAttempt: null,
      questions: Array.from({ length: 10 }, (_, index) => ({
        id: `q-${index}`,
        question: `Question ${index + 1}?`,
        options: ["A", "B", "C", "D"],
      })),
    };
    let finished = false;
    const base = challengeQuiz ? "/challenges/build-one/quizzes" : "/quizzes";
    await page.route(`http://127.0.0.1:18027${base}?*`, (route) =>
      route.fulfill({ json: { data: finished ? [quiz] : [] } }),
    );
    await page.route(`http://127.0.0.1:18027${base}/background-quiz`, (route) =>
      route.fulfill({ json: { data: { quiz, attempts: [] } } }),
    );
    await page.goto(
      challengeQuiz ? "/chat?id=build-one&tab=quizzes" : "/quizzes",
    );
    await page
      .getByRole("button", { name: "Generate quiz", exact: true })
      .click();
    if (!challengeQuiz)
      await page
        .getByRole("textbox", { name: "Quiz prompt", exact: true })
        .fill("Queues");
    await page
      .getByRole("button", { name: "Generate quiz", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Generation progress" }),
    ).toBeVisible();
    expect(server.jobs[0]!.kind).toBe(
      challengeQuiz ? "challenge_quiz" : "quiz",
    );
    await page.getByRole("link", { name: "Preferences", exact: true }).click();
    finished = true;
    server.complete(server.jobs[0]!);
    await expect(
      page.getByRole("button", { name: "Open quiz", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/preferences$/);
    await page.getByRole("button", { name: "Open quiz", exact: true }).click();
    await expect(page).toHaveURL(
      challengeQuiz
        ? /\/chat\?id=build-one&tab=quizzes&quiz=background-quiz$/
        : /\/quizzes\?quiz=background-quiz$/,
    );
    await expect(
      page.getByRole("heading", { name: "Background quiz", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start quiz", exact: true }),
    ).toBeFocused();
  });
}

test("clarification and failure remain actionable from generation activity", async ({
  page,
}) => {
  await seedProfile(page);
  const server = await mockJobs(page);
  await createChallenge(page);
  await page.getByRole("link", { name: "Logs", exact: true }).click();
  server.update(server.jobs[0]!, {
    status: "needs_input",
    clarification: {
      question: "Which input format must be supported?",
      options: ["JSON", "CSV"],
    },
  });
  await page
    .getByRole("button", { name: "Answer", exact: true })
    .click({ timeout: 10000 });
  await expect(
    page.getByRole("heading", {
      name: "Which input format must be supported?",
    }),
  ).toBeVisible();
  await page.getByText("JSON", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "JSON", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Create build", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Generation progress" }),
  ).toBeVisible();
  expect(server.answers).toEqual([
    { question: "Which input format must be supported?", answer: "JSON" },
  ]);
  await page.getByRole("link", { name: "History", exact: true }).click();
  server.update(server.jobs[0]!, {
    status: "failed",
    error: {
      code: "MODEL_UNAVAILABLE",
      message: "The provider is unavailable.",
      retryable: true,
    },
  });
  await page
    .getByRole("button", { name: "Retry", exact: true })
    .click({ timeout: 10000 });
  await expect.poll(server.retries).toBe(1);
  await expect(page).toHaveURL(/\/history$/);
  server.complete(server.jobs[0]!);
  await expect(
    page.getByRole("button", { name: "Open challenge", exact: true }),
  ).toBeVisible({ timeout: 10000 });
});

test("progress, activity, and completion notices fit desktop and mobile in both themes", async ({
  page,
}) => {
  await seedProfile(page);
  const server = await mockJobs(page);
  await mkdir(artifacts, { recursive: true });
  await createChallenge(page);
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `${artifacts}/desktop-light-progress.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.screenshot({
    path: `${artifacts}/mobile-dark-progress.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  server.complete(server.jobs[0]!);
  await expect(
    page.getByRole("button", { name: "Open challenge", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${artifacts}/mobile-dark-completed.png`,
    animations: "disabled",
  });
});

test("a profile change clears the previous profile’s generation notifications", async ({
  page,
}) => {
  await seedProfile(page);
  const server = await mockJobs(page);
  await createChallenge(page);
  server.complete(server.jobs[0]!);
  await expect(
    page.getByRole("button", { name: "Open challenge", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Change profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open challenge", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Notifications/ })).toHaveCount(
    0,
  );
  expect(server.jobs[0]!.profileId).toBe(profile.id);
});

test("finishing a challenge quiz keeps the current attempt selected and saving", async ({
  page,
}) => {
  await seedProfile(page);
  const server = await mockJobs(page);
  const quiz = {
    id: "existing-quiz",
    challengeId: "build-one",
    number: 1,
    title: "Existing quiz",
    topic: null,
    prompt: null,
    difficulty: null,
    questionCount: 5,
    coverage: "mixed",
    createdAt: "2026-01-01T00:00:00Z",
    latestAttempt: { number: 1, status: "draft", answered: 0, score: null },
    questions: Array.from({ length: 5 }, (_, index) => ({
      id: `q-${index}`,
      question: `Existing question ${index + 1}?`,
      options: ["First", "Second", "Third", "Fourth"],
    })),
  };
  const attempt = {
    id: "existing-attempt",
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
  let finished = false;
  let saves = 0;
  await page.route(
    "http://127.0.0.1:18027/challenges/build-one/quizzes?*",
    (route) =>
      route.fulfill({
        json: {
          data: finished
            ? [
                {
                  ...quiz,
                  id: "background-quiz",
                  title: "Background quiz",
                  number: 2,
                  latestAttempt: null,
                },
                quiz,
              ]
            : [quiz],
        },
      }),
  );
  await page.route(
    "http://127.0.0.1:18027/challenges/build-one/quizzes/existing-quiz",
    (route) => route.fulfill({ json: { data: { quiz, attempts: [attempt] } } }),
  );
  await page.route(
    "http://127.0.0.1:18027/challenges/build-one/quizzes/existing-quiz/attempts/existing-attempt/answers",
    (route) => {
      const input = route.request().postDataJSON();
      saves++;
      return route.fulfill({
        json: {
          data: {
            ...attempt,
            answers: input.answers,
            revision: input.revision + 1,
          },
        },
      });
    },
  );
  await page.goto("/chat?id=build-one&tab=quizzes");
  await expect(
    page.getByText("Existing question 1?", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/quiz=existing-quiz/);
  await page
    .getByRole("button", { name: "Generate quiz", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate quiz", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Generation progress" }),
  ).toBeVisible();
  finished = true;
  server.complete(server.jobs[0]!);
  await expect(
    page.getByRole("button", { name: "Open quiz", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page).toHaveURL(/quiz=existing-quiz/);
  await expect(
    page.getByText("Existing question 1?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Background quiz", exact: true }),
  ).toHaveCount(0);
  await page.getByText("First", { exact: true }).click();
  await expect.poll(() => saves).toBe(1);
});

test("notifications separate cancellation from clearing and preserve results", async ({
  page,
}) => {
  await seedProfile(page);
  const server = await mockJobs(page);
  await createChallenge(page);
  await page.getByRole("button", { name: /Notifications/ }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("button", { name: "Clear all" })).toBeDisabled();
  await panel
    .getByRole("button", { name: "Cancel challenge generation" })
    .click();
  await expect.poll(() => server.jobs[0]?.status).toBe("cancelled");
  await panel.getByRole("button", { name: "Clear all" }).click();
  await expect(panel.getByText("No notifications")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(page.getByText("No notifications")).toBeVisible();
  await page.keyboard.press("Escape");
  server.complete(server.jobs[0]!);
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(panel.getByRole("link", { name: "Open challenge" })).toBeVisible(
    { timeout: 10000 },
  );
  await panel.getByRole("button", { name: "Clear all" }).click();
  expect(server.jobs[0]?.status).toBe("completed");
  expect(server.jobs[0]?.resultId).toBe("build-one");
});
