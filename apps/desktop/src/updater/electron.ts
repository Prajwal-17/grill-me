import {
  app,
  safeStorage,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  ipcMain,
} from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DesktopUpdater } from "./updater";
import { updateCredentialStore } from "./credentials";
import { installNativeUpdate } from "./install";
import { executablePath } from "@repo/backend/local/executable-path";
import { desktopIdentity, type DesktopChannel } from "../identity";
const execute = promisify(execFile);
export async function registerUpdater(input: {
  window: BrowserWindow;
  root: string;
  channel: DesktopChannel;
  appId: string;
  trusted(event: IpcMainInvokeEvent): void;
}) {
  const updater = new DesktopUpdater({
    root: input.root,
    version: app.getVersion(),
    platform: process.platform === "darwin" ? "darwin" : "linux",
    arch: process.arch,
    enabled: app.isPackaged && input.channel === "production",
    credentials: updateCredentialStore(input.root, {
      available: () =>
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== "linux" ||
          safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    }),
    ownerToken: async () => {
      try {
        const result = await execute(
          "gh",
          ["auth", "token", "--hostname", "github.com"],
          {
            timeout: 5000,
            maxBuffer: 16384,
            env: { ...process.env, PATH: executablePath(process.env) },
          },
        );
        return result.stdout.trim() || null;
      } catch {
        return null;
      }
    },
    install: (installer, version) =>
      installNativeUpdate({
        platform: process.platform,
        installer,
        version,
        root: input.root,
        executable: process.execPath,
        appId: input.appId,
        bundleName: `${desktopIdentity(input.channel).executableName}.app`,
        relaunch: () => app.relaunch(),
        quit: () => app.quit(),
      }),
    publish: (state) => {
      if (!input.window.isDestroyed())
        input.window.webContents.send("desktop:update-state", state);
    },
  });
  const ready = updater.initialize();
  ipcMain.handle("desktop:update-state", async (event) => {
    input.trusted(event);
    await ready;
    return updater.snapshot();
  });
  ipcMain.handle("desktop:update-configure", async (event, value: unknown) => {
    input.trusted(event);
    await ready;
    return updater.configure(value);
  });
  for (const [name, action] of [
    ["forget", () => updater.forget()],
    ["check", () => updater.check()],
    ["download", () => updater.download()],
    ["install", () => updater.install()],
    ["cancel", () => updater.cancel()],
  ] as const)
    ipcMain.handle(`desktop:update-${name}`, async (event) => {
      input.trusted(event);
      await ready;
      return action();
    });
  const timer = setInterval(
    () => {
      if (
        updater.snapshot().enabled &&
        updater.snapshot().authorized &&
        !["downloading", "downloaded", "installing"].includes(
          updater.snapshot().phase,
        )
      )
        void updater.check();
    },
    6 * 60 * 60 * 1000,
  );
  timer.unref();
  input.window.once("closed", () => {
    clearInterval(timer);
    updater.cancel();
  });
}
