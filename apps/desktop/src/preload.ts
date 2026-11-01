import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@repo/contracts";
const bridge: DesktopBridge = {
  platform: process.platform === "darwin" ? "darwin" : "linux",
  getAppVersion: () => ipcRenderer.invoke("desktop:app-version"),
  minimizeWindow: () => ipcRenderer.invoke("desktop:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("desktop:maximize"),
  closeWindow: () => ipcRenderer.invoke("desktop:close"),
  getConnection: () => ipcRenderer.invoke("desktop:connection"),
  getWindowState: () => ipcRenderer.invoke("desktop:window"),
  setWindowSettings: (input) => ipcRenderer.invoke("desktop:set-window", input),
  zoom: (direction) => ipcRenderer.invoke("desktop:zoom", direction),
  toggleFullscreen: () => ipcRenderer.invoke("desktop:fullscreen"),
  openDataFolder: () => ipcRenderer.invoke("desktop:data-folder"),
  selectProjectsFolder: (currentPath) =>
    ipcRenderer.invoke("desktop:select-projects-folder", currentPath),
  onWindowState: (listener) => {
    const receive = (_event: unknown, value: Parameters<typeof listener>[0]) =>
      listener(value);
    ipcRenderer.on("desktop:window-state", receive);
    return () => {
      ipcRenderer.removeListener("desktop:window-state", receive);
    };
  },
  onOpenSettings: (listener) => {
    const receive = () => listener();
    ipcRenderer.on("desktop:open-settings", receive);
    return () => {
      ipcRenderer.removeListener("desktop:open-settings", receive);
    };
  },
};
contextBridge.exposeInMainWorld("desktopBridge", Object.freeze(bridge));
