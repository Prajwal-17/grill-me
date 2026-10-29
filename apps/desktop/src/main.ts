import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  session,
  protocol,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { appendFileSync } from "node:fs";
import { backendEnvironment, desktopConfiguration } from "./config";

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
  const config = desktopConfiguration(dataRoot);
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
    ? [
        "--no-env-file",
        "--preload",
        join(desktopRoot, "scripts/sqlite-preload.ts"),
        join(desktopRoot, "src/backend.ts"),
      ]
    : [];
  const logPath = join(dataRoot, "backend.log");
  const child = spawn(executable, args, {
    cwd: dataRoot,
    detached: true,
    env: backendEnvironment({
      dataRoot,
      token,
      settings: config.values,
      port: devUrl ? Number(process.env.DESKTOP_DEV_API_PORT) : 0,
      rendererRoot: app.isPackaged
        ? join(process.resourcesPath, "renderer")
        : resolve(import.meta.dirname, "../renderer"),
      webOrigin: devUrl ? new URL(devUrl).origin : "grill-me://app",
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
    webPreferences: {
      session: desktopSession,
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
  window.once("ready-to-show", () => window?.show());
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
            label: "Configure AI…",
            click: () => {
              void shell.openPath(config.path);
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
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
        ],
      },
    ]),
  );
  await window.loadURL(devUrl ?? "grill-me://app/");
}
