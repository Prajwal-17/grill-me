import { AppError } from "../../shared/errors/app-error";
import type { ProfileModel } from "./profile.model";
import { toProfile } from "./profile.utils";

export function createProfileService(model: ProfileModel) {
  return {
    start(email: string) {
      return toProfile(model.findByEmail(email) ?? model.create(email));
    },

    assertExists(id: string) {
      if (!model.findById(id)) {
        throw new AppError(
          "PROFILE_NOT_FOUND",
          "This local profile no longer exists. Enter your email again.",
          401,
        );
      }
      return id;
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
