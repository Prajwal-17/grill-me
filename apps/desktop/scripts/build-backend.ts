import { createRequire } from "node:module";
import { mkdir, cp, readFile, rm, chmod, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";

import { buildTarget } from "../src/build-target";
const target = buildTarget(process.platform, process.arch);
const root = resolve(import.meta.dir, "..");
await rm(resolve(root, "resources/backend"), { recursive: true, force: true });
await mkdir(resolve(root, "resources/backend"), { recursive: true });
// The backend uses a native N-API binding independently of Electron's ABI.
// Stage its JS loader and the native host binding beside the compiled Bun server.
const requireBackend = createRequire(
  resolve(root, "../../packages/backend/package.json"),
);
const keyringRoot = dirname(requireBackend.resolve("@napi-rs/keyring"));
const manifest = JSON.parse(
  await readFile(join(keyringRoot, "package.json"), "utf8"),
) as { optionalDependencies: Record<string, string> };
const nativeName = target.nativeName;
if (!manifest.optionalDependencies[nativeName])
  throw new Error(`Unsupported native credential binding: ${nativeName}.`);
const nativeRoot = dirname(
  createRequire(join(keyringRoot, "package.json")).resolve(nativeName),
);
for (const [name, source] of [
  ["@napi-rs/keyring", keyringRoot],
  [nativeName, nativeRoot],
]) {
  await cp(source!, resolve(root, "resources/backend/node_modules", name!), {
    recursive: true,
    filter: (path) => !path.includes("/node_modules/", source!.length),
  });
}

// Keep the parser as a bundled worker beside the executable. Bun's compiled
// import.meta URL cannot resolve a source-relative TypeScript worker at runtime.
const worker = await Bun.build({
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
if (!worker.success)
  throw new AggregateError(worker.logs, "Resume worker build failed");
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
await chmod(resolve(root, "resources/backend/grill-me-backend"), 0o755);
await writeFile(
  resolve(root, "resources/backend/target.json"),
  JSON.stringify(target),
);
console.log("Built the standalone SQLite backend.");
