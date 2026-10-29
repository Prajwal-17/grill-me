import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
await mkdir(resolve(root, "resources/backend"), { recursive: true });
// Keep the parser as a bundled worker beside the executable. Bun's compiled
// import.meta URL cannot resolve a source-relative TypeScript worker at runtime.
await Bun.build({
  entrypoints: [
    resolve(
      root,
      "../../packages/backend/src/modules/profiles/resume.worker.ts",
    ),
  ],
  outdir: resolve(root, "resources/backend"),
  naming: "resume.worker.js",
  target: "bun",
  minify: true,
});
const result = await Bun.build({
  entrypoints: [resolve(root, "src/backend.ts")],
  target: "bun",
  minify: true,
  compile: {
    outfile: resolve(root, "resources/backend/grill-me-backend"),
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
});
if (!result.success)
  throw new AggregateError(result.logs, "Desktop backend build failed");
console.log("Built the standalone SQLite backend.");
