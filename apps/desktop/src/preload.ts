import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@repo/backend/shared/contracts";
const bridge: DesktopBridge = {
  platform: process.platform === "darwin" ? "darwin" : "linux",
  getAppVersion: () => ipcRenderer.invoke("desktop:app-version"),
  getUpdateState: () => ipcRenderer.invoke("desktop:update-state"),
  configureUpdates: (input) =>
    ipcRenderer.invoke("desktop:update-configure", input),
  forgetUpdateToken: () => ipcRenderer.invoke("desktop:update-forget"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:update-check"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:update-download"),
  installUpdate: () => ipcRenderer.invoke("desktop:update-install"),
  cancelUpdateDownload: () => ipcRenderer.invoke("desktop:update-cancel"),
  onUpdateState: (listener) => {
    const receive = (_event: unknown, value: Parameters<typeof listener>[0]) =>
      listener(value);
    ipcRenderer.on("desktop:update-state", receive);
    return () => ipcRenderer.removeListener("desktop:update-state", receive);
  },
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
  selectWorkspaceFolder: (currentPath) =>
    ipcRenderer.invoke("desktop:select-workspace-folder", currentPath),
  getWorkspaceEditors: () => ipcRenderer.invoke("desktop:workspace-editors"),
  openWorkspaceInEditor: (input) =>
    ipcRenderer.invoke("desktop:open-workspace", input),
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
