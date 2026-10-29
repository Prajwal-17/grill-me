import { useCallback, useEffect, useState } from "react";
import { useSidebar } from "@/shared/stores/app-store";
export function useAppNavigation() {
  const { collapsed, toggle: toggleStore } = useSidebar();
  const toggle = useCallback(() => {
    const restoreFocus =
      collapsed || Boolean(document.activeElement?.closest("#desktop-sidebar"));
    toggleStore();
    if (restoreFocus)
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(
            collapsed
              ? '[aria-label="Collapse sidebar"]'
              : '[aria-label="Open sidebar"]',
          )
          ?.focus();
      });
  }, [collapsed, toggleStore]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = matchMedia("(min-width: 768px)");
    const update = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;

      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, select, [role='textbox']"))
        ) {
          return;
        }

        event.preventDefault();
        if (matchMedia("(min-width: 768px)").matches) {
          toggle();
        } else setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [toggle]);
  return { collapsed, toggle, open, setOpen };
}
