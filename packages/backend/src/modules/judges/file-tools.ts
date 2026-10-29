import { open, readdir, realpath } from "node:fs/promises";
import { resolve, sep, relative } from "node:path";
import type { DynamicToolSpec } from "./protocol/v2/DynamicToolSpec";
import { z } from "zod";
const schemas = {
  grill_list_files: z.object({
    path: z.string().default("."),
    offset: z.number().int().nonnegative().default(0),
  }),
  grill_read_file: z.object({
    path: z.string(),
    offset: z.number().int().nonnegative().default(0),
  }),
  grill_search_file: z.object({
    path: z.string(),
    query: z.string().min(1),
    offset: z.number().int().nonnegative().default(0),
  }),
};
const descriptions = {
  grill_list_files:
    "List entries in a snapshot directory. Pages of 200 entries; continue with nextOffset. Only submitted files are accessible.",
  grill_read_file:
    "Read a UTF-8 source file in 16 KiB pages using byte offsets. Continue at nextOffset until null; there is no file-size limit.",
  grill_search_file:
    "Search one snapshot file for a literal string, starting at a byte offset. Returns the next matching page and continuation offset. Use list_files to locate files first.",
};
export const snapshotTools: DynamicToolSpec[] = Object.entries(schemas).map(
  ([name, schema]) => ({
    type: "function",
    name,
    description: descriptions[name as keyof typeof descriptions],
    inputSchema: z.toJSONSchema(
      schema,
    ) as import("./protocol/serde_json/JsonValue").JsonValue,
  }),
);
export async function callSnapshotTool(
  root: string,
  tool: string,
  args: unknown,
) {
  if (!(tool in schemas)) throw new Error("Unknown snapshot tool.");
  const input = schemas[tool as keyof typeof schemas].parse(args);
  const canonicalRoot = await realpath(root);
  const file = await realpath(resolve(root, input.path));
  if (file !== canonicalRoot && !file.startsWith(canonicalRoot + sep))
    throw new Error("Only files inside the submitted snapshot can be read.");
  if (tool === "grill_list_files") {
    const entries = (await readdir(file, { withFileTypes: true }))
      .filter((e) => !e.isSymbolicLink())
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      entries: entries.slice(input.offset, input.offset + 200).map((e) => ({
        path: relative(root, resolve(file, e.name)),
        directory: e.isDirectory(),
      })),
      nextOffset:
        input.offset + 200 < entries.length ? input.offset + 200 : null,
    };
  }
  const handle = await open(file, "r");
  try {
    const size = (await handle.stat()).size;
    let offset = input.offset;
    const query =
      "query" in input && typeof input.query === "string" ? input.query : null;
    let previous = "";
    do {
      const bytes = Buffer.alloc(16384);
      const read = await handle.read(bytes, 0, bytes.length, offset);
      const text = bytes.subarray(0, read.bytesRead).toString("utf8");
      const start = offset;
      offset += read.bytesRead;
      const matches = !query || (previous + text).includes(query);
      if (matches)
        return {
          path: input.path,
          offset: start,
          text: previous + text,
          nextOffset: offset < size ? offset : null,
        };
      previous = query ? text.slice(-query.length) : "";
      if (!read.bytesRead) break;
    } while (offset < size);
    return { path: input.path, text: "", nextOffset: null };
  } finally {
    await handle.close();
  }
}
