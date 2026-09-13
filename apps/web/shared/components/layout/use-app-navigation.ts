"use client";
import { useEffect, useRef, useState } from "react";
import { useSidebar } from "@/shared/stores/app-store";
export function useAppNavigation() {
  const { collapsed, toggle } = useSidebar();
  const previousCollapsed = useRef(collapsed);
  useEffect(() => {
    if (previousCollapsed.current === collapsed) return;
    previousCollapsed.current = collapsed;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          collapsed
            ? '[aria-label="Open sidebar"]'
            : '[aria-label="Collapse sidebar"]',
        )
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [collapsed]);
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
      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        if (matchMedia("(min-width: 768px)").matches) toggle();
        else setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [toggle]);
  return { collapsed, toggle, open, setOpen };
}
