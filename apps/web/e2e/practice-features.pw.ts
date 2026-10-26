import { mkdir } from "node:fs/promises";
import { test, expect, seedProfile, challenge } from "./fixtures";

const screenshots = "/tmp/grill-me-practice-feature-qa";

test("home enhancement preserves the draft, supports undo, and generates only on request", async ({
  page,
  apiRequests,
}) => {
  await seedProfile(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received: unknown;
  const enhanced = "Give me a coding exercise to practice Python closures.";
  await page.route("**/challenges/enhance-prompt", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      prompt: "Python closures",
    });
    await pending;
    await route.fulfill({ json: { data: { prompt: enhanced } } });
  });
  await page.route("**/challenges/generate", async (route) => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { data: challenge } });
  });
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you want to build",
  });
  const enhance = page.getByRole("button", {
    name: "Enhance prompt",
    exact: true,
  });
  await expect(enhance).toBeDisabled();
  await input.fill("Python closures");
  await enhance.click();
  await expect(
    page.getByRole("button", { name: "Enhancing prompt", exact: true }),
  ).toBeDisabled();
  await expect(input).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Create build", exact: true }),
  ).toBeDisabled();
  release();
  await expect(input).toHaveValue(enhanced);
  await expect(input).toBeFocused();
  expect(apiRequests).not.toContain("/challenges/generate");
  expect(apiRequests).not.toContain("/challenges/prepare");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(input).toHaveValue("Python closures");
  await enhance.click();
  await expect(input).toHaveValue(enhanced);
  await input.fill(enhanced + " Avoid decorators.");
  await page.getByRole("button", { name: "Create build", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\?id=build-one/);
  expect(received).toMatchObject({
    prompt: enhanced + " Avoid decorators.",
    scope: "focused",
    difficulty: "medium",
  });
});

test("failed home enhancement retains the original prompt and can be retried", async ({
  page,
}) => {
  await seedProfile(page);
  let fail = true;
  await page.route("**/challenges/enhance-prompt", (route) =>
    route.fulfill(
      fail
        ? {
            status: 502,
            json: {
              error: {
                code: "MODEL_UNAVAILABLE",
                message: "Enhancement is unavailable. Try again.",
                retryable: true,
              },
            },
          }
        : { json: { data: { prompt: "Give me a coding exercise in C." } } },
    ),
  );
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you want to build",
  });
  await input.fill("C");
  await page
    .getByRole("button", { name: "Enhance prompt", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Enhancement is unavailable",
  );
  await expect(input).toHaveValue("C");
  await expect(input).toBeEnabled();
  fail = false;
  await page
    .getByRole("button", { name: "Enhance prompt", exact: true })
    .click();
  await expect(input).toHaveValue("Give me a coding exercise in C.");
});

for (const status of ["active", "paused", "completed"] as const) {
  test(`archive and restore retain a ${status} challenge`, async ({ page }) => {
    await seedProfile(page);
    let current = {
      ...challenge,
      status,
      completedAt: status === "completed" ? challenge.createdAt : null,
    };
    await page.route("**/challenges/active", (route) =>
      route.fulfill({
        json: {
          data:
            current.archivedAt || current.status === "completed"
              ? []
              : [current],
        },
      }),
    );
    await page.route("**/challenges/archived", (route) =>
      route.fulfill({ json: { data: current.archivedAt ? [current] : [] } }),
    );
    await page.route("**/challenges/history", (route) =>
      route.fulfill({
        json: {
          data:
            !current.archivedAt && current.status === "completed"
              ? [current]
              : [],
        },
      }),
    );
    await page.route("**/challenges/build-one", (route) =>
      route.fulfill({ json: { data: current } }),
    );
    await page.route("**/challenges/build-one/archive", (route) => {
      expect(route.request().method()).toBe("POST");
      current = { ...current, archivedAt: "2026-10-26T00:00:00Z" };
      return route.fulfill({ json: { data: current } });
    });
    await page.route("**/challenges/build-one/restore", (route) => {
      expect(route.request().method()).toBe("POST");
      current = { ...current, archivedAt: null };
      return route.fulfill({ json: { data: current } });
    });
    await page.goto("/chat?id=build-one");
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page).toHaveURL(/\/challenges\?status=archived/);
    await expect(page.getByRole("tab", { name: /Archived/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("link", { name: /Group words/ }).click();
    await expect(
      page.getByRole("button", { name: "Restore", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mark completed", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("tab", { name: "Submit", exact: true }).click();
    await expect(
      page.getByText("This challenge is archived. Restore it to continue."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Archive", exact: true }),
    ).toBeVisible();
    expect(current.status).toBe(status);
    expect(current.archivedAt).toBeNull();
    if (status === "completed")
      await expect(
        page.getByText("You marked this challenge completed."),
      ).toBeVisible();
    if (status === "paused")
      await expect(page.getByText("This challenge is paused.")).toBeVisible();
  });
}

test("enhancement and archived collections fit both themes on desktop and mobile", async ({
  page,
}) => {
  await mkdir(screenshots, { recursive: true });
  await seedProfile(page);
  await page.route("**/challenges/enhance-prompt", (route) =>
    route.fulfill({
      json: {
        data: {
          prompt: "Give me a coding exercise to practice Python closures.",
        },
      },
    }),
  );
  await page.route("**/challenges/archived", (route) =>
    route.fulfill({
      json: { data: [{ ...challenge, archivedAt: challenge.createdAt }] },
    }),
  );
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      })
      .click();
    await page
      .getByRole("textbox", { name: "Describe what you want to build" })
      .fill("Python closures");
    await page
      .getByRole("button", { name: "Enhance prompt", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeVisible();
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("button", { name: "Enhance prompt", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${screenshots}/home-${theme}-${width}.png`,
        animations: "disabled",
      });
    }
    await page.goto("/challenges?status=archived");
    await expect(page.getByRole("tab", { name: /Archived/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("link", { name: /Group words/ }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${screenshots}/archived-${theme}-${width}.png`,
        animations: "disabled",
      });
    }
  }
});
