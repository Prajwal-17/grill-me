import { AppError } from "../../shared/errors/app-error";
import type { ProfileModel, ProfilePreferencesModel } from "./profile.model";
import type { SavePreferencesInput } from "./profile.schema";
import { toProfile, toProfilePreferences } from "./profile.utils";

export function createProfileService(
  model: ProfileModel,
  preferences: ProfilePreferencesModel,
) {
  function preferencesFor(profileId: string) {
    const row =
      preferences.findByProfileId(profileId) ??
      preferences.createDefaults(profileId) ??
      preferences.findByProfileId(profileId);

    if (!row) {
      throw new AppError(
        "PREFERENCES_UNAVAILABLE",
        "Preferences could not be loaded. Try again.",
        500,
        true,
      );
    }
    return toProfilePreferences(row);
  }

  function assertExists(id: string) {
    if (!model.findById(id)) {
      throw new AppError(
        "PROFILE_NOT_FOUND",
        "This local profile no longer exists. Enter your email again.",
        401,
      );
    }
    return id;
  }

  return {
    start(email: string) {
      const profile = toProfile(
        model.findByEmail(email) ?? model.create(email),
      );
      preferencesFor(profile.id);
      return profile;
    },

    assertExists,

    getPreferences(profileId: string) {
      assertExists(profileId);
      return preferencesFor(profileId);
    },

    savePreferences(profileId: string, input: SavePreferencesInput) {
      assertExists(profileId);
      return toProfilePreferences(preferences.save(profileId, input));
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
