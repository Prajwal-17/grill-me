import type { Profile } from "../../../shared/types/api";

export const PROFILE_STORAGE_KEY = "grill-me.profile";

export function getStoredProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as Profile;
  } catch {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    return null;
  }
}

export function storeProfile(profile: Profile) {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearProfile() {
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
}
