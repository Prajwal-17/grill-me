import { createRequire } from "node:module";
import { mkdir, cp, readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";

const root = resolve(import.meta.dir, "..");
await mkdir(resolve(root, "resources/backend"), { recursive: true });
// The backend uses a native N-API binding independently of Electron's ABI.
// Stage its JS loader and the Linux host binding beside the compiled Bun server.
const requireBackend = createRequire(
  resolve(root, "../../packages/backend/package.json"),
);
const keyringRoot = dirname(requireBackend.resolve("@napi-rs/keyring"));
const manifest = JSON.parse(
  await readFile(join(keyringRoot, "package.json"), "utf8"),
) as { optionalDependencies: Record<string, string> };
const nativeName = `@napi-rs/keyring-linux-${process.arch}-gnu`;
if (!manifest.optionalDependencies[nativeName])
  throw new Error("Unsupported Linux architecture for secret storage.");
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
