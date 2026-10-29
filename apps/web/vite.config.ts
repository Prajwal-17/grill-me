import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { z } from "zod";
import { parseWebEnv } from "@repo/ui/env-schema";

export default defineConfig(({ mode }) => {
  const local = process.env.GRILL_LOCAL_DEV === "1";
  const values = local
    ? { VITE_APP_ENV: "development", VITE_API_URL: "/api" }
    : loadEnv(mode, process.cwd(), ["VITE_", "API_PROXY_TARGET"]);
  const connectionPath = resolve(
    fileURLToPath(new URL("../../", import.meta.url)),
    process.env.GRILL_LOCAL_HOME ?? ".data/standalone-dev",
    "connection.json",
  );
  const connection = () => {
    try {
      return JSON.parse(readFileSync(connectionPath, "utf8")) as {
        url: string;
        token: string;
      };
    } catch {
      return {
        url: `http://127.0.0.1:${process.env.LOCAL_BACKEND_PORT ?? 18028}`,
        token: "",
      };
    }
  };
  const localProxy = () => ({
    target: connection().url,
    changeOrigin: true,
    configure(
      proxy: Parameters<
        NonNullable<import("vite").ProxyOptions["configure"]>
      >[0],
    ) {
      proxy.on("proxyReq", (request) => {
        request.setHeader("Authorization", `Bearer ${connection().token}`);
      });
    },
  });
  const env = parseWebEnv(values, mode);
  // This target is server-only; Docker/browser hostnames need not match.
  const proxy = {
    "^/api(?:/|$)": local
      ? localProxy()
      : {
          target: z
            .url({ protocol: /^https?$/ })
            .parse(
              values.API_PROXY_TARGET ??
                (env.appEnv === "production"
                  ? "http://127.0.0.1:17017"
                  : "http://127.0.0.1:8027"),
            ),
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, "") || "/",
        },
  };
  if (local)
    Object.assign(proxy, {
      "/_local": localProxy(),
      "/ws": { ...localProxy(), ws: true },
    });
  return {
    cacheDir: resolve(import.meta.dirname, "node_modules/.vite-web"),
    envDir: local ? resolve(".local-no-env") : undefined,
    plugins: [
      react(),
      {
        name: "initial-theme",
        transformIndexHtml() {
          return [
            {
              tag: "script",
              injectTo: "head-prepend" as const,
              children: `(function(){var t='dark';try{var s=JSON.parse(localStorage.getItem('grill-me.app.${env.appEnv}')||'{}');t=s&&s.state&&s.state.theme==='light'?'light':'dark'}catch(e){}document.documentElement.dataset.theme=t})()`,
            },
          ];
        },
      },
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
      },
    },
    define: {
      "import.meta.env.VITE_LOCAL_TRANSPORT": JSON.stringify(local),
      "import.meta.env.VITE_API_URL": JSON.stringify(env.apiUrl),
      "import.meta.env.VITE_APP_ENV": JSON.stringify(env.appEnv),
    },
    server: {
      fs: {
        deny: [
          "**/.env*",
          "**/.git/**",
          "**/.data/**",
          "**/connection.json",
          "**/*.sqlite*",
          "**/backend.env",
        ],
      },
      port: Number(process.env.LOCAL_WEB_PORT ?? 8028),
      strictPort: true,
      proxy,
    },
    preview: {
      port: Number(process.env.LOCAL_WEB_PORT ?? 8028),
      strictPort: true,
      proxy,
    },
  };
});
