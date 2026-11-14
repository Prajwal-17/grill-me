import { contextBridge, ipcRenderer } from "electron";
import type { DesktopSetupBridge } from "@repo/backend/shared/contracts";

const bridge: DesktopSetupBridge = {
  getState: () => ipcRenderer.invoke("desktop:setup-state"),
  chooseFolder: (target, currentParent) =>
    ipcRenderer.invoke("desktop:setup-choose-folder", target, currentParent),
  complete: (choice) => ipcRenderer.invoke("desktop:setup-complete", choice),
  retry: () => ipcRenderer.invoke("desktop:setup-retry"),
  cancel: () => ipcRenderer.invoke("desktop:setup-cancel"),
};
contextBridge.exposeInMainWorld("setupBridge", Object.freeze(bridge));
