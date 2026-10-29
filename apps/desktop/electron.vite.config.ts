import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, "src/main.ts") },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "../web"),
    envDir: resolve(import.meta.dirname, "env"),
    plugins: [
      react(),
      {
        name: "desktop-stable-origin-assets",
        enforce: "post",
        config: () => ({ base: "/" }),
      },
      {
        name: "desktop-initial-theme",
        transformIndexHtml: () => [
          {
            tag: "script",
            injectTo: "head-prepend",
            children: `(function(){var t='dark';try{var s=JSON.parse(localStorage.getItem('grill-me.app.development')||'{}');t=s&&s.state&&s.state.theme==='light'?'light':'dark'}catch(e){}document.documentElement.dataset.theme=t})()`,
          },
        ],
      },
    ],
    resolve: { alias: { "@": resolve(import.meta.dirname, "../web/src") } },
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify("/api"),
      "import.meta.env.VITE_APP_ENV": JSON.stringify("development"),
    },
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${process.env.DESKTOP_DEV_API_PORT ?? "18027"}`,
          headers: {
            Authorization: `Bearer ${process.env.DESKTOP_DEV_API_TOKEN ?? ""}`,
          },
        },
      },
    },
    build: {
      outDir: resolve(import.meta.dirname, "out/renderer"),
      rollupOptions: {
        input: resolve(import.meta.dirname, "../web/index.html"),
      },
    },
  },
});
