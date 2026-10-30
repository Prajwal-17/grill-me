const process = require("node:process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
module.exports = async (context) => {
  const arch = require("node:module").createRequire(
    require.resolve("electron-builder"),
  )("builder-util").Arch[context.arch];
  const platform = context.electronPlatformName;
  const target = JSON.parse(
    readFileSync(
      join(context.packager.projectDir, "resources/backend/target.json"),
      "utf8",
    ),
  );
  if (
    target.platform !== platform ||
    target.arch !== arch ||
    platform !== process.platform ||
    arch !== process.arch
  )
    throw new Error(
      `Backend ${target.platform}/${target.arch}, Electron ${platform}/${arch}, and host ${process.platform}/${process.arch} must match. Use the native package script.`,
    );
};
