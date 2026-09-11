"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "./tooltip";
const KEY = "grill-me-sidebar";
const EVENT = "grill-me-sidebar-change";
let fallbackCollapsed = false;
const SidebarContext = createContext({ collapsed: false, toggle: () => {} });
export const useSidebar = () => useContext(SidebarContext);
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(KEY) === "collapsed";
  } catch {
    return fallbackCollapsed;
  }
}
function toggle() {
  fallbackCollapsed = !snapshot();
  try {
    localStorage.setItem(KEY, fallbackCollapsed ? "collapsed" : "expanded");
  } catch {
    /* Preserve the selection in memory if storage is unavailable. */
  }
  window.dispatchEvent(new Event(EVENT));
}
export function UIProvider({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <TooltipProvider delayDuration={300}>
        <SidebarContext.Provider value={{ collapsed, toggle }}>
          {children}
        </SidebarContext.Provider>
      </TooltipProvider>
    </MotionConfig>
  );
}
