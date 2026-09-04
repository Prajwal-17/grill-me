"use client";

import type { Profile } from "../../../shared/types/api";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { PROFILE_STORAGE_KEY } from "../lib/profile-storage";

const HYDRATING = "__grill_me_hydrating__";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function useProfile() {
  const router = useRouter();
  const stored = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(PROFILE_STORAGE_KEY),
    () => HYDRATING,
  );

  useEffect(() => {
    if (stored === null) router.replace("/");
  }, [router, stored]);

  if (stored === HYDRATING) return undefined;
  if (!stored) return null;

  try {
    return JSON.parse(stored) as Profile;
  } catch {
    return null;
  }
}
