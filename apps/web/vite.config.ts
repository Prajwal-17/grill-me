import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { z } from "zod";
import { parseWebEnv } from "./src/shared/config/env-schema.ts";

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), ["VITE_", "API_PROXY_TARGET"]);
  const env = parseWebEnv(values, mode);
  // This target is server-only; Docker/browser hostnames need not match.
  const proxy = {
    "^/api(?:/|$)": {
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
  return {
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
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(env.apiUrl),
      "import.meta.env.VITE_APP_ENV": JSON.stringify(env.appEnv),
    },
    server: { port: 8028, strictPort: true, proxy },
    preview: { port: 8028, strictPort: true, proxy },
  };
});
