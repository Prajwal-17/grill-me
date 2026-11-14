export type DesktopChannel = "development" | "production";

export function desktopIdentity(channel: DesktopChannel) {
  if (channel !== "development" && channel !== "production")
    throw new Error("Invalid desktop build channel.");
  const dev = channel === "development";
  return {
    channel,
    productName: dev ? "Grill Me Dev" : "Grill Me",
    // Electron Builder uses executableName for the .app filename as well.
    executableName: dev ? "grill-me-dev" : "grill-me",
    appId: dev ? "local.grill-me.desktop-dev" : "local.grill-me.desktop",
    dataDirectory: dev ? "grill-me-desktop-dev" : "grill-me-desktop",
    dataFolderName: dev ? "Grill Me Dev" : "Grill Me",
    workspaceFolderName: dev
      ? "Grill Me Dev Workspaces"
      : "Grill Me Workspaces",
    partition: dev
      ? "persist:grill-me-desktop-dev"
      : "persist:grill-me-desktop",
    storageKey: `grill-me.app.${channel}`,
  };
}
