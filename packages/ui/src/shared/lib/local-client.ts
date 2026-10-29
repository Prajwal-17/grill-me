import { LocalClient } from "@repo/client";
import type { ConnectionBootstrap } from "@repo/contracts";
export const localTransport =
  import.meta.env.VITE_LOCAL_TRANSPORT === true ||
  import.meta.env.VITE_LOCAL_TRANSPORT === "true";
let instance: LocalClient | undefined;
export function localClient() {
  if (!instance)
    instance = new LocalClient(async () => {
      if (window.desktopBridge) return window.desktopBridge.getConnection();
      const response = await fetch("/_local/bootstrap", {
        method: "POST",
        headers: { "X-Grill-Client": "1" },
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Cannot connect to the local backend. Start bun dev:backend first.",
        );
      const connection = (await response.json()) as ConnectionBootstrap;
      const url = new URL(location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/ws";
      url.search = "";
      url.hash = "";
      return { ...connection, wsUrl: url.href };
    });
  return instance;
}

declare global {
  interface Window {
    desktopBridge?: import("@repo/contracts").DesktopBridge;
  }
}
