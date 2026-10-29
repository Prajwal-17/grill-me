import { AppError } from "../../shared/errors/app-error";
import type { ProfileModel, ProfilePreferencesModel } from "./profile.model";
import type { SavePreferencesInput } from "./profile.schema";
import { toProfile, toProfilePreferences } from "./profile.utils";

export function createProfileService(
  model: ProfileModel,
  preferences: ProfilePreferencesModel,
) {
  async function preferencesFor(profileId: string) {
    const row =
      (await preferences.findByProfileId(profileId)) ??
      (await preferences.createDefaults(profileId)) ??
      (await preferences.findByProfileId(profileId));

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

  async function assertExists(id: string) {
    if (!(await model.findById(id))) {
      throw new AppError(
        "PROFILE_NOT_FOUND",
        "This local profile no longer exists. Enter your email again.",
        401,
      );
    }
    return id;
  }

  return {
    async start(email: string) {
      const profileRow =
        (await model.findByEmail(email)) ?? (await model.create(email));
      if (!profileRow)
        throw new AppError(
          "PROFILE_UNAVAILABLE",
          "Profile could not be created.",
          500,
        );
      const profile = toProfile(profileRow);
      await preferencesFor(profile.id);
      return profile;
    },

    assertExists,

    async getPreferences(profileId: string) {
      await assertExists(profileId);
      return preferencesFor(profileId);
    },

    async savePreferences(profileId: string, input: SavePreferencesInput) {
      await assertExists(profileId);
      const saved = await preferences.save(profileId, input);
      if (!saved)
        throw new AppError(
          "PREFERENCES_UNAVAILABLE",
          "Preferences could not be saved.",
          500,
        );
      return toProfilePreferences(saved);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
