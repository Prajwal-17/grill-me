export type DesktopChannel = "development" | "production";

export function desktopIdentity(channel: DesktopChannel) {
  if (channel !== "development" && channel !== "production")
    throw new Error("Invalid desktop build channel.");
  const dev = channel === "development";
  return {
    channel,
    productName: dev ? "Grill Me Dev" : "Grill Me",
    appId: dev ? "local.grill-me.desktop-dev" : "local.grill-me.desktop",
    dataDirectory: dev ? "grill-me-desktop-dev" : "grill-me-desktop",
    partition: dev
      ? "persist:grill-me-desktop-dev"
      : "persist:grill-me-desktop",
    storageKey: `grill-me.app.${channel}`,
  };
}
