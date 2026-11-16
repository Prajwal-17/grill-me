import { expect, test } from "bun:test";
import { desktopClipboardWriteSchema } from "@repo/backend/shared/contracts";
import { writeClipboardText } from "./clipboard";

test("uses the browser clipboard when it is available", async () => {
  const calls: string[] = [];
  await writeClipboardText("hello", {
    browser: {
      writeText: async (text) => {
        calls.push(`browser:${text}`);
      },
    },
    desktop: {
      writeClipboardText: async ({ text }) => {
        calls.push(`desktop:${text}`);
      },
    },
  });
  expect(calls).toEqual(["browser:hello"]);
});

test("falls back to the desktop bridge when browser clipboard access is denied", async () => {
  const calls: string[] = [];
  await writeClipboardText("workspace/path", {
    browser: {
      writeText: async () => {
        throw new Error("NotAllowedError");
      },
    },
    desktop: {
      writeClipboardText: async ({ text }) => {
        calls.push(text);
      },
    },
  });
  expect(calls).toEqual(["workspace/path"]);
});

test("uses the desktop bridge when the browser clipboard is absent", async () => {
  let written: string | undefined;
  await writeClipboardText("copied text", {
    browser: null,
    desktop: {
      writeClipboardText: async ({ text }) => {
        written = text;
      },
    },
  });
  expect(written).toBe("copied text");
});

test("reports a real failure when neither clipboard path is available", async () => {
  await expect(
    writeClipboardText("text", { browser: null, desktop: null }),
  ).rejects.toThrow("Clipboard unavailable.");
  await expect(
    writeClipboardText("text", {
      browser: {
        writeText: async () => {
          throw new Error("NotAllowedError");
        },
      },
      desktop: {
        writeClipboardText: async () => {
          throw new Error("Native clipboard failed.");
        },
      },
    }),
  ).rejects.toThrow("Native clipboard failed.");
});

test("validates bounded native clipboard payloads", () => {
  expect(
    desktopClipboardWriteSchema.parse({ text: "line one\nline two" }),
  ).toEqual({ text: "line one\nline two" });
  for (const input of [
    {},
    { text: "" },
    { text: "a".repeat(2_000_001) },
    { text: "a\0b" },
    { text: 1 },
    { text: "extra", unexpected: true },
  ]) {
    expect(desktopClipboardWriteSchema.safeParse(input).success).toBe(false);
  }
});
