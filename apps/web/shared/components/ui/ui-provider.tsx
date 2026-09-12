"use client";
import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { APP_STORAGE_KEY, useAppStore } from "@/shared/stores/app-store";
import { TooltipProvider } from "@/shared/components/ui/tooltip";

function StoreHydrator() {
  const theme = useAppStore((state) => state.theme);
  const hydrated = useAppStore((state) => state.hydrated);

  useEffect(() => {
    void useAppStore.persist.rehydrate();
    const sync = (event: StorageEvent) => {
      if (event.key === APP_STORAGE_KEY) void useAppStore.persist.rehydrate();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (hydrated) document.documentElement.dataset.theme = theme;
  }, [hydrated, theme]);

  return null;
}

export function UIProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <TooltipProvider delayDuration={300}>
        <StoreHydrator />
        {children}
      </TooltipProvider>
    </MotionConfig>
  );
}
