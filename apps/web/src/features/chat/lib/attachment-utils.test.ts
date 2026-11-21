import { describe, expect, test } from "bun:test";
import {
  MAX_GENERATION_TOTAL_BYTES,
  MAX_INLINE_GENERATION_BYTES,
  readGenerationAttachments,
} from "./attachment-utils";

const extract = async (file: File) => ({
  filename: file.name,
  text: `extracted:${file.name}`,
});

describe("generation attachments", () => {
  test("reads text files inline", async () => {
    const files = await readGenerationAttachments(
      [new File(["const app = 1;\n"], "main.ts")],
      [],
      extract,
    );
    expect(files).toEqual([{ filename: "main.ts", text: "const app = 1;\n" }]);
  });

  test("sends documents to server extraction whatever their size", async () => {
    const files = await readGenerationAttachments(
      [new File(["%PDF-fake"], "spec.pdf")],
      [],
      extract,
    );
    expect(files).toEqual([
      { filename: "spec.pdf", text: "extracted:spec.pdf" },
    ]);
  });

  test("routes oversized text files through server extraction", async () => {
    const files = await readGenerationAttachments(
      [new File(["x".repeat(MAX_INLINE_GENERATION_BYTES + 1)], "big.txt")],
      [],
      extract,
    );
    expect(files[0]?.text).toBe("extracted:big.txt");
  });

  test("attaches small images as image data", async () => {
    const files = await readGenerationAttachments(
      [new File([new Uint8Array(1024)], "pic.png")],
      [],
    );
    expect(files[0]).toMatchObject({
      filename: "pic.png",
      mimeType: "image/png",
    });
  });

  test("rejects binary content and oversized images", async () => {
    await expect(
      readGenerationAttachments(
        [new File([new Uint8Array([0, 1])], "blob.bin")],
        [],
      ),
    ).rejects.toThrow("binary file");
    await expect(
      readGenerationAttachments(
        [new File([new Uint8Array(513 * 1024)], "big.png")],
        [],
      ),
    ).rejects.toThrow("image limit");
  });

  test("enforces the combined attachment budget", async () => {
    const existing = {
      filename: "big.txt",
      text: "x".repeat(MAX_GENERATION_TOTAL_BYTES + 1),
    };
    await expect(
      readGenerationAttachments([new File(["a"], "a.txt")], [existing]),
    ).rejects.toThrow("limit");
  });
});
