import { apiRequest } from "../../../shared/lib/api-client";
import type { Profile, ProfilePreferences } from "../../../shared/types/api";

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
  preferences: Omit<ProfilePreferences, "profileId" | "updatedAt">,
) {
  return apiRequest<ProfilePreferences>(
    "/profiles/preferences",
    { method: "POST", body: JSON.stringify(preferences) },
    profileId,
  );
}
