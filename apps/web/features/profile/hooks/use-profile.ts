"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  PROFILE_STORAGE_EVENT,
  PROFILE_STORAGE_KEY,
  parseStoredProfile,
} from "../lib/profile-storage";

const HYDRATING = "__grill_me_hydrating__";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PROFILE_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PROFILE_STORAGE_EVENT, callback);
  };
}

export function useProfile() {
  const router = useRouter();
  const stored = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(PROFILE_STORAGE_KEY),
    () => HYDRATING,
  );

  const hydrating = stored === HYDRATING;
  const profile = parseStoredProfile(stored);
  useEffect(() => {
    if (!hydrating && !profile && window.location.pathname !== "/")
      router.replace("/");
  }, [router, hydrating, profile]);

  return hydrating ? undefined : profile;
}
