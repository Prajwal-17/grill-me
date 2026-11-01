import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  session,
  protocol,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { backendEnvironment } from "./config";
import { windowSettingsStore } from "./window-settings";
import { windowSettingsSchema, type DesktopState } from "@repo/contracts";
import { desktopIdentity, type DesktopChannel } from "./identity";
import { registerUpdater } from "./updater/electron";

declare const __DESKTOP_CHANNEL__: DesktopChannel;
const identity = desktopIdentity(__DESKTOP_CHANNEL__);
if (app.isPackaged) {
  const metadata = JSON.parse(
    readFileSync(join(app.getAppPath(), "package.json"), "utf8"),
  );
  if (metadata.desktopChannel !== identity.channel)
    throw new Error(
      "Desktop bundle and package channels differ. Rebuild with the matching package command.",
    );
}
app.setName(identity.productName);
app.setAppUserModelId(identity.appId);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "grill-me",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
app.setPath("userData", join(app.getPath("appData"), identity.dataDirectory));
let backend: ChildProcess | undefined;
let quitting = false;
let shutdownComplete = false;
let window: BrowserWindow | undefined;
function stopBackend(): Promise<void> {
  const child = backend;
  backend = undefined;
  if (!child?.pid) return Promise.resolve();
  const pid = child.pid;
  const signal = (value: NodeJS.Signals) => {
    try {
      process.kill(-pid, value);
    } catch {
      /* already exited */
    }
  };
  child.stdin?.end();
  signal("SIGTERM");
  return new Promise((done) => {
    setTimeout(() => {
      signal("SIGKILL");
      done();
    }, 3000);
  });
}
app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  void stopBackend().finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  void app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox(
        "Grill Me could not start",
        `${error instanceof Error ? error.message : String(error)}\n\nDesktop data: ${app.getPath("userData")}`,
      );
      app.quit();
    });
}

async function start() {
  const dataRoot = app.getPath("userData");
  mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  const preferences = windowSettingsStore(dataRoot);
  const devUrl = !app.isPackaged
    ? process.env.ELECTRON_RENDERER_URL
    : undefined;
  const token = devUrl
    ? process.env.DESKTOP_DEV_API_TOKEN
    : randomBytes(32).toString("hex");
  if (!token)
    throw new Error("Use bun run desktop:dev to launch development mode.");
  const desktopRoot = resolve(import.meta.dirname, "../..");
  const executable = devUrl
    ? process.env.DESKTOP_DEV_BUN
    : app.isPackaged
      ? join(process.resourcesPath, "backend/grill-me-backend")
      : join(desktopRoot, "resources/backend/grill-me-backend");
  if (!executable) throw new Error("Use bun dev to start the source backend.");
  let keyringModule: string | undefined;
  if (!devUrl) {
    const target = JSON.parse(
      readFileSync(join(dirname(executable), "target.json"), "utf8"),
    );
    if (target.platform !== process.platform || target.arch !== process.arch)
      throw new Error(
        `Backend target ${target.platform}/${target.arch} does not match Electron ${process.platform}/${process.arch}. Rebuild on a matching native host.`,
      );
    const nativeRoot = join(
      dirname(executable),
      "node_modules",
      target.nativeName,
    );
    const native = JSON.parse(
      readFileSync(join(nativeRoot, "package.json"), "utf8"),
    );
    keyringModule = join(nativeRoot, native.main);
  }
  const args = devUrl
    ? ["--no-env-file", join(desktopRoot, "src/backend.ts")]
    : [];
  const logPath = join(dataRoot, "backend.log");
  const child = spawn(executable, args, {
    cwd: dataRoot,
    detached: true,
    env: backendEnvironment({
      channel: identity.channel,
      dataRoot,
      token,
      settings: {},
      port: devUrl ? Number(process.env.DESKTOP_DEV_API_PORT) : 0,
      rendererRoot: app.isPackaged
        ? join(process.resourcesPath, "renderer")
        : resolve(import.meta.dirname, "../renderer"),
      webOrigin: devUrl ? new URL(devUrl).origin : "grill-me://app",
      keyringModule,
      workerPath: devUrl
        ? undefined
        : join(dirname(executable), "resume.worker.js"),
    }),
    stdio: ["pipe", "pipe", "pipe"],
  });
  backend = child;
  child.stderr?.on("data", (data: Buffer) => appendFileSync(logPath, data));
  const port = await new Promise<number>((resolvePort, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Backend startup timed out. See ${logPath}`)),
      30_000,
    );
    const lines = createInterface({ input: child.stdout! });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Backend exited (${code}). See ${logPath}`));
    });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line) as { event?: string; port?: number };
        if (message.event === "desktop-ready" && message.port) {
          clearTimeout(timeout);
          resolvePort(message.port);
        }
      } catch {
        /* ordinary backend log */
      }
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const desktopSession = session.fromPartition(identity.partition);
  // A stable origin keeps profiles, theme, and recovery storage across restarts,
  // even though each backend gets a different private loopback port.
  await desktopSession.protocol.handle("grill-me", (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Not found", { status: 404 });
    const upstream = new URL(origin);
    upstream.pathname = url.pathname;
    upstream.search = url.search;
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(
      new Request(upstream, {
        method: request.method,
        headers,
        redirect: "error",
        signal: request.signal,
        body: request.body,
        ...(request.body ? { duplex: "half" } : {}),
      }),
    );
  });
  window = new BrowserWindow({
    title: identity.productName,
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join(desktopRoot, "resources/icons/512x512.png"),
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#0a0a0a",
    show: false,
    fullscreen: false,
    frame: process.platform === "darwin",
    autoHideMenuBar: true,
    webPreferences: {
      session: desktopSession,
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  desktopSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  desktopSession.setPermissionCheckHandler(() => false);
  const allowedOrigin = devUrl ? new URL(devUrl).origin : "null";
  function external(url: string) {
    if (["https:", "http:", "mailto:"].includes(new URL(url).protocol))
      void shell.openExternal(url);
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const destination = new URL(url);
    const internal = devUrl
      ? destination.origin === allowedOrigin
      : destination.protocol === "grill-me:" && destination.host === "app";
    if (!internal) {
      event.preventDefault();
      external(url);
    }
  });
  const state = (): DesktopState => ({
    ...preferences.get(),
    fullscreen: window?.isFullScreen() ?? false,
    maximized: window?.isMaximized() ?? false,
    focused: window?.isFocused() ?? false,
  });
  const publish = () =>
    window?.webContents.send("desktop:window-state", state());
  const zoom = (direction: "in" | "out" | "reset") => {
    const current = preferences.get().zoom;
    const next =
      direction === "reset"
        ? 1
        : Math.round(
            Math.max(
              0.5,
              Math.min(2, current + (direction === "in" ? 0.1 : -0.1)),
            ) * 100,
          ) / 100;
    preferences.set({ zoom: next });
    window?.webContents.setZoomFactor(next);
    publish();
    return state();
  };
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      event.preventDefault();
      window?.setFullScreen(!window.isFullScreen());
      return;
    }
    if (input.key === "F5") {
      event.preventDefault();
      window?.webContents.reload();
      return;
    }
    if (!(input.control || input.meta) || input.alt) return;
    if (input.key.toLowerCase() === "r") {
      event.preventDefault();
      window?.webContents.reload();
      return;
    }
    if (["q", "w"].includes(input.key.toLowerCase())) {
      event.preventDefault();
      if (input.key.toLowerCase() === "q") app.quit();
      else window?.close();
      return;
    }
    if (input.shift && input.key.toLowerCase() === "i") {
      event.preventDefault();
      window?.webContents.toggleDevTools();
      return;
    }
    if (["+", "=", "-", "0"].includes(input.key)) {
      event.preventDefault();
      zoom(input.key === "0" ? "reset" : input.key === "-" ? "out" : "in");
    } else if (input.key === ",") {
      event.preventDefault();
      window?.webContents.send("desktop:open-settings");
    }
  });
  const restoreZoom = () =>
    window?.webContents.setZoomFactor(preferences.get().zoom);
  restoreZoom();
  // Chromium applies origin-specific zoom during navigation; restore afterwards.
  window.webContents.on("did-finish-load", restoreZoom);
  window.webContents.on("zoom-changed", (_event, direction) => zoom(direction));
  window.on("maximize", publish);
  window.on("unmaximize", publish);
  window.on("focus", publish);
  window.on("blur", publish);
  window.on("enter-full-screen", publish);
  window.on("leave-full-screen", publish);
  const trusted = (event: IpcMainInvokeEvent) => {
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error("Untrusted desktop request.");
    const url = new URL(event.senderFrame.url);
    if (
      devUrl
        ? url.origin !== new URL(devUrl).origin
        : url.protocol !== "grill-me:" || url.host !== "app"
    )
      throw new Error("Untrusted desktop origin.");
  };
  ipcMain.handle("desktop:minimize", (event) => {
    trusted(event);
    window?.minimize();
  });
  await registerUpdater({
    window,
    root: dataRoot,
    channel: identity.channel,
    appId: identity.appId,
    productName: identity.productName,
    trusted,
  });
  ipcMain.handle("desktop:maximize", (event) => {
    trusted(event);
    if (window?.isFullScreen()) window.setFullScreen(false);
    if (window?.isMaximized()) window.unmaximize();
    else window?.maximize();
    return state();
  });
  ipcMain.handle("desktop:close", (event) => {
    trusted(event);
    window?.close();
  });
  ipcMain.handle("desktop:app-version", (event) => {
    trusted(event);
    return app.getVersion();
  });
  ipcMain.handle("desktop:connection", async (event) => {
    trusted(event);
    const response = await fetch(origin + "/_local/bootstrap", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Local backend connection failed.");
    return response.json();
  });
  ipcMain.handle("desktop:window", (event) => {
    trusted(event);
    return state();
  });
  ipcMain.handle("desktop:set-window", (event, input: unknown) => {
    trusted(event);
    const parsed = windowSettingsSchema.partial().strict().parse(input);
    preferences.set(parsed);
    if (parsed.zoom !== undefined)
      window?.webContents.setZoomFactor(parsed.zoom);
    publish();
    return state();
  });
  ipcMain.handle("desktop:zoom", (event, direction: unknown) => {
    trusted(event);
    if (direction !== "in" && direction !== "out" && direction !== "reset")
      throw new Error("Invalid zoom direction.");
    return zoom(direction);
  });
  ipcMain.handle("desktop:fullscreen", (event) => {
    trusted(event);
    window?.setFullScreen(!window.isFullScreen());
    return state();
  });
  ipcMain.handle("desktop:data-folder", (event) => {
    trusted(event);
    return shell.openPath(dataRoot).then((error) => {
      if (error) throw new Error("Could not open the data folder.");
    });
  });
  ipcMain.handle(
    "desktop:select-projects-folder",
    async (event, currentPath: unknown) => {
      trusted(event);
      if (
        currentPath !== undefined &&
        (typeof currentPath !== "string" ||
          currentPath.length > 4096 ||
          currentPath.includes("\0"))
      )
        throw new Error("Invalid project folder path.");
      if (!window || window.isDestroyed())
        throw new Error("The application window is unavailable.");
      try {
        const result = await dialog.showOpenDialog(window, {
          title: "Choose project folder",
          buttonLabel: "Select folder",
          properties: ["openDirectory"],
          ...(typeof currentPath === "string" && isAbsolute(currentPath)
            ? { defaultPath: currentPath }
            : {}),
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      } catch {
        throw new Error(
          "Could not open the folder picker. Try again or enter the path manually.",
        );
      }
    },
  );
  window.once("ready-to-show", () => {
    if (preferences.get().startup === "maximized") window?.maximize();
    window?.show();
  });
  child.on("exit", () => {
    if (!quitting) {
      dialog.showErrorBox(
        "Grill Me backend stopped",
        `Restart the app to continue. See ${logPath}`,
      );
      app.quit();
    }
  });
  window.on("close", (event) => {
    if (process.platform === "darwin" && !quitting) {
      event.preventDefault();
      window?.hide();
    }
  });
  Menu.setApplicationMenu(
    process.platform === "darwin"
      ? Menu.buildFromTemplate([
          {
            label: identity.productName,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Settings…",
                accelerator: "CommandOrControl+,",
                click: () => {
                  window?.show();
                  window?.webContents.send("desktop:open-settings");
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          { role: "editMenu" },
          {
            label: "View",
            submenu: [
              {
                label: "Zoom In",
                accelerator: "CommandOrControl+=",
                click: () => zoom("in"),
              },
              {
                label: "Zoom Out",
                accelerator: "CommandOrControl+-",
                click: () => zoom("out"),
              },
              {
                label: "Actual Size",
                accelerator: "CommandOrControl+0",
                click: () => zoom("reset"),
              },
              { role: "togglefullscreen" },
            ],
          },
          { role: "windowMenu" },
        ])
      : null,
  );
  window.setMenu(null);
  await window.loadURL(devUrl ?? "grill-me://app/");
}
