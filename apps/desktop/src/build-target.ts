export function buildTarget(
  platform: string,
  arch: string,
  hostPlatform: string = process.platform,
  hostArch: string = process.arch,
) {
  if (!(
    (platform === "linux" && arch === "x64") ||
    (platform === "darwin" && ["arm64", "x64"].includes(arch))
  ))
    throw new Error(
      `Unsupported desktop target ${platform}/${arch}. Use linux/x64, darwin/arm64, or darwin/x64.`,
    );
  if (platform !== hostPlatform || arch !== hostArch)
    throw new Error(
      `Target ${platform}/${arch} requires a matching native host; current host is ${hostPlatform}/${hostArch}. Cross-packaging is not supported.`,
    );
  return {
    platform,
    arch,
    nativeName: `@napi-rs/keyring-${platform}-${arch}${platform === "linux" ? "-gnu" : ""}`,
  };
}
