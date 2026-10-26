import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { APP_STORAGE_KEY, useAppStore } from "@/shared/stores/app-store";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { ToastProvider } from "@/shared/components/ui/toast";

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

  useEffect(() => {
    const keyboard = () => {
      document.documentElement.dataset.input = "keyboard";
    };
    const pointer = () => {
      document.documentElement.dataset.input = "pointer";
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  return null;
}

export function UIProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <StoreHydrator />
          {children}
        </ToastProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}
