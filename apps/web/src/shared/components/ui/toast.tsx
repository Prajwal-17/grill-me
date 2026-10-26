import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { AnimatePresence, motion } from "motion/react";
import { useInstantMotion } from "./interaction-motion";

const ToastContext = createContext<((message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const instant = useInstantMotion();
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const nextId = useRef(0);
  const showError = useCallback((message: string) => {
    setToast({ id: ++nextId.current, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={showError}>
      {children}
      <AnimatePresence initial={false} custom={instant}>
        {toast && (
          <motion.div
            key={toast.id}
            initial={instant ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit="exit"
            variants={{
              exit: (immediate: boolean) => ({
                opacity: 0,
                y: immediate ? 0 : 6,
                transition: { duration: immediate ? 0 : 0.1 },
              }),
            }}
            role="alert"
            className="fixed bottom-12 right-4 z-[110] flex max-w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-destructive/40 bg-surface px-4 py-3 text-ui text-foreground shadow-lg"
          >
            <p className="min-w-0 flex-1">{toast.message}</p>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Dismiss notification"
              className="-mr-2 -mt-1 size-7"
              onClick={() => setToast(null)}
            >
              <X size={14} />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

export function useToastError() {
  const showError = useContext(ToastContext);
  if (!showError)
    throw new Error("useToastError must be used inside ToastProvider");
  return showError;
}
