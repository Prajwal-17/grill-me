import type { ProfilePreferencesRow, ProfileRow } from "./profile.model";
import {
  profilePreferencesSchema,
  profileSchema,
  type Profile,
  type ProfilePreferences,
} from "./profile.schema";
export function toProfile(row: ProfileRow): Profile {
  return profileSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}
export function toProfilePreferences(
  row: ProfilePreferencesRow,
): ProfilePreferences {
  return profilePreferencesSchema.parse({
    ...row.guidedPreferences,
    profileId: row.profileId,
    aboutMe: row.aboutMe,
    updatedAt: row.updatedAt.toISOString(),
    developerContextUpdatedAt:
      row.developerContextUpdatedAt?.toISOString() ?? null,
  });
}
