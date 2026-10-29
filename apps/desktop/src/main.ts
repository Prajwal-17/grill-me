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
import { dirname, join, resolve } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import { backendEnvironment } from "./config";
import { windowSettingsStore } from "./window-settings";
import { windowSettingsSchema, type DesktopState } from "@repo/contracts";

app.setName("Grill Me Dev");
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
// Even packaged builds are explicitly the development edition.
app.setPath("userData", join(app.getPath("appData"), "grill-me-desktop-dev"));
let backend: ChildProcess | undefined;
let quitting = false;
let window: BrowserWindow | undefined;
function stopBackend() {
  if (!backend?.pid) return;
  const child = backend;
  backend = undefined;
  child.stdin?.end();
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    /* already exited */
  }
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      /* already exited */
    }
  }, 3000);
  timer.unref();
  child.once("exit", () => clearTimeout(timer));
}
app.on("before-quit", () => {
  quitting = true;
  stopBackend();
});
app.on("window-all-closed", () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
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
  const args = devUrl
    ? ["--no-env-file", join(desktopRoot, "src/backend.ts")]
    : [];
  const logPath = join(dataRoot, "backend.log");
  const child = spawn(executable, args, {
    cwd: dataRoot,
    detached: true,
    env: backendEnvironment({
      dataRoot,
      token,
      settings: {},
      port: devUrl ? Number(process.env.DESKTOP_DEV_API_PORT) : 0,
      rendererRoot: app.isPackaged
        ? join(process.resourcesPath, "renderer")
        : resolve(import.meta.dirname, "../renderer"),
      webOrigin: devUrl ? new URL(devUrl).origin : "grill-me://app",
      keyringModule: devUrl
        ? undefined
        : join(dirname(executable), "node_modules/@napi-rs/keyring/index.js"),
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
  const desktopSession = session.fromPartition("persist:grill-me-desktop-dev");
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
    title: "Grill Me Dev",
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#0a0a0a",
    show: false,
    fullscreen: preferences.get().startup === "fullscreen",
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
    if (!(input.control || input.meta) || input.alt) return;
    if (["+", "=", "-", "0"].includes(input.key)) {
      event.preventDefault();
      zoom(input.key === "0" ? "reset" : input.key === "-" ? "out" : "in");
    } else if (input.key === ",") {
      event.preventDefault();
      window?.webContents.send("desktop:open-settings");
    }
  });
  window.webContents.setZoomFactor(preferences.get().zoom);
  window.webContents.on("zoom-changed", (_event, direction) => zoom(direction));
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
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Application",
        submenu: [
          {
            label: "Settings…",
            accelerator: "Ctrl+,",
            click: () => {
              window?.webContents.send("desktop:open-settings");
            },
          },
          {
            label: "Open desktop data folder",
            click: () => {
              void shell.openPath(dataRoot);
            },
          },
          {
            label: "Restart",
            click: () => {
              app.relaunch();
              app.quit();
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          {
            label: "Actual size",
            accelerator: "Ctrl+0",
            click: () => zoom("reset"),
          },
          { label: "Zoom in", accelerator: "Ctrl+=", click: () => zoom("in") },
          {
            label: "Zoom in",
            accelerator: "Ctrl+Plus",
            visible: false,
            click: () => zoom("in"),
          },
          {
            label: "Zoom in",
            accelerator: "Ctrl+numadd",
            visible: false,
            click: () => zoom("in"),
          },
          {
            label: "Zoom out",
            accelerator: "Ctrl+-",
            click: () => zoom("out"),
          },
          {
            label: "Zoom out",
            accelerator: "Ctrl+numsub",
            visible: false,
            click: () => zoom("out"),
          },
          {
            label: "Toggle fullscreen",
            accelerator: "F11",
            click: () => window?.setFullScreen(!window.isFullScreen()),
          },
        ],
      },
    ]),
  );
  await window.loadURL(devUrl ?? "grill-me://app/");
}
