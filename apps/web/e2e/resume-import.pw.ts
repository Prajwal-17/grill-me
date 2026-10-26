import { resolve } from "node:path";
import { test, expect, seedProfile } from "./fixtures";

const artifacts = resolve(import.meta.dirname, "../../../artifacts/ui-revamp");
const preview = {
  draft: {
    displayName: "Sam Developer",
    aboutMe: "Builds developer tools",
    languages: [],
    stack: [],
    projects: [],
  },
  warnings: [],
};

test("resume import separates methods, fits both viewports, and applies text only after review", async ({
  page,
  apiRequests,
}) => {
  await seedProfile(page);
  await page.route("**/profiles/resume/preview", (route) =>
    route.fulfill({ json: { data: preview } }),
  );
  await page.goto("/preferences");
  for (const theme of ["dark", "light"]) {
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", {
        name: theme === "dark" ? "Dark" : "Light",
        exact: true,
      })
      .click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page
        .getByRole("button", { name: "Import resume", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("button", { name: "Choose document" }),
      ).toBeVisible();
      await dialog.screenshot({
        path: `${artifacts}/resume-upload-${theme}-${width}.png`,
        animations: "disabled",
      });
      await dialog.getByRole("tab", { name: "Paste text" }).click();
      const extract = dialog.getByRole("button", { name: "Extract from text" });
      await expect(extract).toBeDisabled();
      const text = dialog.getByRole("textbox", { name: "Resume text" });
      await text.fill(
        "I build developer tools using TypeScript and React, with a focus on accessible interfaces.",
      );
      await expect(extract).toBeEnabled();
      await expect(text).toHaveCSS("min-height", "176px");
      await dialog.getByRole("tab", { name: "Upload document" }).click();
      await dialog.getByRole("tab", { name: "Paste text" }).click();
      await expect(text).toHaveValue(/developer tools/);
      await dialog.screenshot({
        path: `${artifacts}/resume-text-${theme}-${width}.png`,
        animations: "disabled",
      });
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page
    .getByRole("button", { name: "Import resume", exact: true })
    .click();
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByRole("textbox", { name: "Resume text" })
    .fill(
      "I build developer tools using TypeScript and React, with a focus on accessible interfaces.",
    );
  const savesBefore = apiRequests.filter(
    (path) => path === "/profiles/preferences",
  ).length;
  await page.getByRole("button", { name: "Extract from text" }).click();
  await expect(
    page.getByRole("heading", { name: "Review resume draft" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply selected details" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Sam Developer");
  expect(
    apiRequests.filter((path) => path === "/profiles/preferences").length,
  ).toBe(savesBefore);
});

test("resume document chooser validates files and recovers from extraction errors", async ({
  page,
}) => {
  await seedProfile(page);
  let requests = 0;
  await page.route("**/profiles/resume/preview", (route) => {
    requests++;
    expect(route.request().headers()["content-type"]).toContain(
      "multipart/form-data",
    );
    return requests === 1
      ? route.fulfill({
          status: 500,
          json: { error: "Could not extract this document. Try again." },
        })
      : route.fulfill({ json: { data: preview } });
  });
  await page.goto("/preferences");
  await page
    .getByRole("button", { name: "Import resume", exact: true })
    .click();
  const chooserEvent = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose document", exact: true })
    .click();
  const chooser = await chooserEvent;
  await chooser.setFiles({
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Invalid document"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a PDF or DOCX document.",
  );
  expect(requests).toBe(0);
  const file = page.getByLabel("Choose a document", { exact: true });
  await file.setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("mock PDF contents"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(requests).toBe(1);
  await file.setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("mock PDF contents"),
  });
  await expect(
    page.getByRole("heading", { name: "Review resume draft" }),
  ).toBeVisible();
  expect(requests).toBe(2);
});
