import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { Button } from "./button";
import { AnimatePresence, motion } from "motion/react";
import { useInstantMotion } from "./interaction-motion";

type ToastInput = {
  id?: string;
  message: string;
  description?: string;
  variant?: "success" | "error" | "info";
  action?: { label: string; onClick: () => void };
  scope?: string;
  duration?: number;
};
type Toast = ToastInput & { id: string };
type ToastAPI = {
  show: (toast: ToastInput) => void;
  dismissScope: (scope: string) => void;
};
const ToastContext = createContext<ToastAPI | null>(null);

function ToastMessage({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: string) => void;
}) {
  const instant = useInstantMotion();
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(
    () => document.visibilityState === "visible",
  );
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (paused || !visible) return;
    const timer = window.setTimeout(
      () => dismiss(toast.id),
      toast.duration ?? (toast.action ? 10000 : 6000),
    );
    return () => window.clearTimeout(timer);
  }, [toast, dismiss, paused, visible]);
  const Icon =
    toast.variant === "error"
      ? CircleAlert
      : toast.variant === "success"
        ? CheckCircle2
        : Info;
  return (
    <motion.div
      initial={instant ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: instant ? 0 : 6,
        transition: { duration: instant ? 0 : 0.1 },
      }}
      transition={{ duration: instant ? 0 : 0.16 }}
      role={toast.variant === "error" ? "alert" : "status"}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface px-4 py-3 text-ui text-foreground shadow-lg ${toast.variant === "error" ? "border-destructive/40" : "border-line"}`}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={`mt-0.5 shrink-0 ${toast.variant === "success" ? "text-success" : toast.variant === "error" ? "text-destructive" : "text-muted"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{toast.message}</p>
        {toast.description && (
          <p className="mt-1 break-words text-supporting text-muted">
            {toast.description}
          </p>
        )}
        {toast.action && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              dismiss(toast.id);
              toast.action?.onClick();
            }}
          >
            {toast.action.label}
          </Button>
        )}
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss notification"
        className="-mr-2 -mt-1 size-7"
        onClick={() => dismiss(toast.id)}
      >
        <X size={14} />
      </Button>
    </motion.div>
  );
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const show = useCallback((toast: ToastInput) => {
    const next = { ...toast, id: toast.id ?? `toast-${++nextId.current}` };
    setToasts((current) =>
      [...current.filter((item) => item.id !== next.id), next].slice(-4),
    );
  }, []);
  const dismiss = useCallback(
    (id: string) =>
      setToasts((current) => current.filter((toast) => toast.id !== id)),
    [],
  );
  const dismissScope = useCallback(
    (scope: string) =>
      setToasts((current) => current.filter((toast) => toast.scope !== scope)),
    [],
  );
  const api = useMemo(() => ({ show, dismissScope }), [show, dismissScope]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 bottom-12 z-[110] flex w-[min(25rem,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastMessage key={toast.id} toast={toast} dismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside ToastProvider");
  return api;
}
export function useToastError() {
  const { show } = useToast();
  return useCallback(
    (message: string) => show({ message, variant: "error" }),
    [show],
  );
}
