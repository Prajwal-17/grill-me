const { readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

module.exports = async (context) => {
  const resources =
    context.electronPlatformName === "darwin"
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents/Resources",
        )
      : join(context.appOutDir, "resources");
  const backend = join(resources, "backend");
  const target = JSON.parse(readFileSync(join(backend, "target.json"), "utf8"));
  const nativeRoot = join(backend, "node_modules", target.nativeName);
  const native = JSON.parse(
    readFileSync(join(nativeRoot, "package.json"), "utf8"),
  );
  for (const file of [
    join(backend, "node_modules/@napi-rs/keyring/index.js"),
    join(nativeRoot, native.main),
  ]) {
    if (!statSync(file).isFile())
      throw new Error(`Packaged credential-storage module is missing: ${file}`);
  }
};
