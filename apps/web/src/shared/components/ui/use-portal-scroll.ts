import { useEffect } from "react";

const scrollablePopupSelector = [
  '[data-slot="popover-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="select-content"]',
].join(",");

/**
 * Radix modal dialogs lock wheel and touch scrolling outside their content.
 * Popper content renders in a body-level portal, outside that content, so the
 * lock would otherwise stop its lists from scrolling. Let events that target a
 * popup pass through before the dialog scroll lock sees them; the browser
 * still performs the native scroll on the list underneath.
 */
export function usePassThroughPortalScroll() {
  useEffect(() => {
    const release = (event: Event) => {
      if (event instanceof WheelEvent && event.ctrlKey) return;
      const target = event.target;
      const popup =
        target instanceof Element
          ? target.closest(scrollablePopupSelector)
          : null;
      if (!popup) return;
      event.stopPropagation();
    };
    window.addEventListener("wheel", release, { capture: true });
    window.addEventListener("touchmove", release, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("wheel", release, { capture: true });
      window.removeEventListener("touchmove", release, { capture: true });
    };
  }, []);
}
