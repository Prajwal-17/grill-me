import { apiRequest } from "@/shared/lib/api-client";
import type { Profile, ProfilePreferences } from "@/shared/types/api";

export const preferencesKey = (profileId?: string) =>
  ["profile", "preferences", profileId] as const;

export function startProfile(email: string) {
  return apiRequest<Profile>("/profiles/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function getPreferences(profileId: string) {
  return apiRequest<ProfilePreferences>("/profiles/preferences", {}, profileId);
}

export function savePreferences(
  profileId: string,
  preferences: Omit<
    ProfilePreferences,
    "profileId" | "updatedAt" | "developerContextUpdatedAt"
  >,
) {
  return apiRequest<ProfilePreferences>(
    "/profiles/preferences",
    { method: "POST", body: JSON.stringify(preferences) },
    profileId,
  );
}

export function previewResume(
  profileId: string,
  input: File | string,
  signal: AbortSignal,
) {
  let body: FormData | string;
  if (typeof input === "string") body = JSON.stringify({ text: input });
  else {
    body = new FormData();
    body.append("file", input);
  }
  return apiRequest<import("@repo/preferences").ResumePreview>(
    "/profiles/resume/preview",
    { method: "POST", body, signal },
    profileId,
  );
}
