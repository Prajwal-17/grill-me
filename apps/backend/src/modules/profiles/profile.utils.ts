import { migrateLegacyPreferences } from "@repo/preferences";
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
  const migrated = migrateLegacyPreferences(row);
  return profilePreferencesSchema.parse({
    ...(row.guidedPreferences ?? migrated.guided),
    profileId: row.profileId,
    preferredDuration: row.preferredDuration,
    difficulty: row.difficulty,
    aboutMe: row.aboutMe,
    legacyPreferences: migrated.legacy,
    updatedAt: row.updatedAt.toISOString(),
  });
}
