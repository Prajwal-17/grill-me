import { useSyncExternalStore } from "react";

const query = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;

/** Keep the record inspector beside the ledger on wide desktop windows. */
export function useInlineInspector() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
