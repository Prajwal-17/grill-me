import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./app/router";
import { AppProviders } from "./app/providers";
import "katex/dist/katex.min.css";
import "./app/globals.css";

export function mountApp(element: HTMLElement) {
  if (window.desktopBridge) document.documentElement.dataset.desktop = "true";
  createRoot(element).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}
