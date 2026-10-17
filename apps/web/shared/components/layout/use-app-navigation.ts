"use client";
import { useEffect, useState } from "react";
import { useSidebar } from "@/shared/stores/app-store";
export function useAppNavigation() {
  const { collapsed, toggle } = useSidebar();
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
          // Move focus out of the sidebar before the shortcut hides it.
          if (document.activeElement?.closest("#desktop-sidebar")) {
            document
              .querySelector<HTMLButtonElement>(
                '[aria-controls="desktop-sidebar"]',
              )
              ?.focus();
          }
          toggle();
        } else setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [toggle]);
  return { collapsed, toggle, open, setOpen };
}
