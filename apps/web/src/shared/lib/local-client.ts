import { LocalClient } from "./rpc-client";
export const localTransport =
  String(import.meta.env.VITE_LOCAL_TRANSPORT) === "true";
let instance: LocalClient | undefined;
export function localClient() {
  if (!instance)
    instance = new LocalClient(async () => {
      if (window.desktopBridge) return window.desktopBridge.getConnection();
      throw new Error(
        "Open Grill Me through the desktop application. Restart it if the backend is unavailable.",
      );
    });
  return instance;
}

declare global {
  interface Window {
    desktopBridge?: import("@repo/backend/shared/contracts").DesktopBridge;
  }
}
