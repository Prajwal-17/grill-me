import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

declare const self: Worker;
async function extractDocument(input: {
  format: "pdf" | "docx";
  bytes: ArrayBuffer;
  /** Optional overrides; resume keeps the defaults when omitted. */
  maxPages?: number;
  minChars?: number;
}) {
  let document: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    const { format, bytes } = input;
    const maxPages = input.maxPages ?? 30;
    const minChars = input.minChars ?? 40;
    let text: string;
    const warnings: string[] = [];
    if (format === "pdf") {
      document = await getDocumentProxy(new Uint8Array(bytes));
      if ((await document.getPermissions()) !== null)
        return { error: "RESUME_ENCRYPTED" };
      if (maxPages > 0 && document.numPages > maxPages) {
        return { error: "RESUME_TOO_MANY_PAGES" };
      }
      const result = await extractText(document, { mergePages: true });
      text = result.text;
      if (text.trim().length < minChars) {
        return { error: "RESUME_UNREADABLE_PDF" };
      }
    } else {
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      text = result.value;
      if (result.messages.length)
        warnings.push(
          "The DOCX parser reported unsupported document elements. Check the extracted details carefully.",
        );
    }
    return { text, warnings };
  } catch (error) {
    const encrypted =
      error instanceof Error &&
      /password|encrypt/i.test(error.name + " " + error.message);
    return { error: encrypted ? "RESUME_ENCRYPTED" : "RESUME_MALFORMED" };
  } finally {
    await document?.loadingTask.destroy();
  }
}
self.onmessage = async (
  event: MessageEvent<{ format: "pdf" | "docx"; bytes: ArrayBuffer }>,
) => {
  self.postMessage(await extractDocument(event.data));
};
