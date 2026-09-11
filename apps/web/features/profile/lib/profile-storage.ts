import type { Profile } from "../../../shared/types/api";

export const PROFILE_STORAGE_KEY = "grill-me.profile";
export const PROFILE_STORAGE_EVENT = "grill-me:profile-storage-change";

export function parseStoredProfile(value: string | null): Profile | null {
  if (!value) return null;
  try {
    const profile: unknown = JSON.parse(value);
    if (!profile || typeof profile !== "object") return null;
    if (
      !("id" in profile) ||
      typeof profile.id !== "string" ||
      !("email" in profile) ||
      typeof profile.email !== "string" ||
      !("createdAt" in profile) ||
      typeof profile.createdAt !== "string"
    )
      return null;
    return profile as Profile;
  } catch {
    return null;
  }
}

export function getStoredProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!value) return null;

  return parseStoredProfile(value);
}

function emitProfileChange() {
  window.dispatchEvent(new Event(PROFILE_STORAGE_EVENT));
}

export function storeProfile(profile: Profile) {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  emitProfileChange();
}

export function clearProfile() {
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  emitProfileChange();
}
