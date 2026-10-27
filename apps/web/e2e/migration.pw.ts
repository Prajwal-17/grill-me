import { test, expect, seedProfile, profile } from "./fixtures";

test("profile selection, persistence, theme, and sign-out", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile email").fill(profile.email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Change profile" }).click();
  await expect(page.getByLabel("Profile email")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("grill-me.app.test")!).state.profile,
      ),
    )
    .toBeNull();
});

test("existing persisted state and every primary route survive direct loads", async ({
  page,
}) => {
  await seedProfile(page);
  for (const [path, heading] of [
    ["/", "Home"],
    ["/challenges", "Challenges"],
    ["/quizzes", "Quizzes"],
    ["/history", "History"],
    ["/preferences", "Preferences"],
    ["/logs", "Logs"],
  ]) {
    await page.goto(path!);
    await expect(
      page.getByRole("heading", { name: heading!, exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
  expect(
    await page.evaluate(() => localStorage.getItem("grill-me.app.production")),
  ).toBe("production-state-must-stay-untouched");
});

test("profile guard and legacy chat redirects", async ({ page }) => {
  await page.goto("/preferences");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Profile email")).toBeVisible();
  for (const path of ["/chat", "/chat?id=build-one&new=1", "/chat?id="]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
  }
});

test("tabs update immediately, preserve drafts, and follow browser history", async ({
  page,
}) => {
  await seedProfile(page);
  await page.goto("/chat?id=build-one&extra=keep#workspace");
  await page.getByRole("tab", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(/extra=keep&tab=submit#workspace$/);
  await page.getByText("Paste code", { exact: true }).click();
  await page.getByLabel("Implementation code").fill("const draft = 'keep me';");
  await page.getByRole("tab", { name: /Reviews/ }).click();
  await expect(page.getByRole("tab", { name: /Reviews/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await expect(page.getByLabel("Implementation code")).toHaveValue(
    "const draft = 'keep me';",
  );
  await page.goForward();
  await expect(page.getByRole("tab", { name: /Reviews/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("tab", { name: /Reviews/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Quizzes", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Quizzes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("log detail deep links, breadcrumbs, and pagination retain filters", async ({
  page,
}) => {
  await seedProfile(page);
  await page.goto("/logs?page=2&status=success&search=mock");
  await page.getByRole("link", { name: /Build generation/ }).click();
  await expect(page).toHaveURL(
    /\/logs\/log-one\?page=2&status=success&search=mock$/,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Build generation", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Logs" })
    .click();
  await expect(page).toHaveURL(/\/logs\?page=2&status=success&search=mock$/);
});

test("generation opens from its completion toast and streams hints", async ({
  page,
  apiRequests,
}) => {
  await seedProfile(page);
  await page.goto("/");
  await page
    .getByLabel("Describe what you want to build")
    .fill("Practice grouping words");
  await page.getByRole("button", { name: "Create build", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("button", { name: "Open challenge", exact: true })
    .click();
  await expect(page).toHaveURL(/\/chat\?id=build-one$/);
  await expect(
    page.getByRole("heading", { name: "#1 Group words", exact: true }),
  ).toBeVisible();
  expect(apiRequests).toContain("/generation-jobs");
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Challenge hint" }),
  ).toContainText("Use a map to group words.");
});

test("unknown routes recover and local assets load", async ({ page }) => {
  await page.goto("/missing-page");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page.getByLabel("Profile email")).toBeVisible();
  await expect(page).toHaveTitle("Grill Me");
  expect(
    await page
      .locator('img[src="/icon.svg"]')
      .first()
      .evaluate((node) => (node as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(async () => {
      await document.fonts.load('16px "Inter Variable"');
      return document.fonts.check('16px "Inter Variable"');
    }),
  ).toBe(true);
});

test("sidebar navigation stays in one document and reuses query cache", async ({
  page,
  apiRequests,
}) => {
  await seedProfile(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.testDocument = "original";
  });
  const activeRequests = apiRequests.filter(
    (path) => path === "/challenges/active",
  ).length;
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Challenges" })
    .click();
  await expect(page).toHaveURL(/\/challenges$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-document",
    "original",
  );
  expect(
    apiRequests.filter((path) => path === "/challenges/active").length,
  ).toBe(activeRequests);
});

test("quiz filters retain their existing per-profile storage namespace", async ({
  page,
}) => {
  await seedProfile(page);
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("quiz-filter-seeded")) {
      localStorage.setItem(
        `grill-me.quiz-library.test.${id}`,
        JSON.stringify({
          version: 1,
          search: "existing filter",
          status: "all",
          difficulty: "all",
          sort: "oldest",
          page: 1,
        }),
      );
      sessionStorage.setItem("quiz-filter-seeded", "true");
    }
  }, profile.id);
  await page.goto("/quizzes");
  await expect(
    page.getByRole("searchbox", { name: "Search quizzes" }),
  ).toHaveValue("existing filter");
  await page
    .getByRole("searchbox", { name: "Search quizzes" })
    .fill("changed filter");
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search quizzes" }),
  ).toHaveValue("changed filter");
});

test("invalid stored profiles recover through the existing API error flow", async ({
  page,
}) => {
  await seedProfile(page);
  await page.route("http://127.0.0.1:18027/challenges/build-one", (route) =>
    route.fulfill({
      status: 404,
      json: {
        error: {
          code: "PROFILE_NOT_FOUND",
          message: "Profile no longer exists",
          retryable: false,
        },
      },
    }),
  );
  await page.goto("/chat?id=build-one");
  await expect(page.getByLabel("Profile email")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("source uploads retain chunking and profile headers", async ({ page }) => {
  await seedProfile(page);
  const chunks: { offset: number; data: string; finish: boolean }[] = [];
  await page.route("http://127.0.0.1:18027/uploads", (route) => {
    expect(route.request().headers()["x-profile-id"]).toBe(profile.id);
    expect(route.request().postDataJSON()).toEqual({
      filename: "implementation.ts",
    });
    return route.fulfill({ json: { data: { id: "upload-one" } } });
  });
  await page.route(
    "http://127.0.0.1:18027/uploads/upload-one/chunks",
    (route) => {
      expect(route.request().headers()["x-profile-id"]).toBe(profile.id);
      chunks.push(route.request().postDataJSON());
      return route.fulfill({ json: { data: {} } });
    },
  );
  await page.goto("/chat?id=build-one&tab=submit");
  await page.getByLabel("Attach source files").setInputFiles({
    name: "implementation.ts",
    mimeType: "text/plain",
    buffer: Buffer.alloc(300_000, "x"),
  });
  await expect(
    page.getByRole("button", { name: "Remove implementation.ts" }),
  ).toBeVisible();
  expect(chunks.map(({ offset, finish }) => ({ offset, finish }))).toEqual([
    { offset: 0, finish: false },
    { offset: 262_144, finish: true },
  ]);
  expect(chunks.map(({ data }) => Buffer.from(data, "base64").length)).toEqual([
    262_144, 37_856,
  ]);
});
