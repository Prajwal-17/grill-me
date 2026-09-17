import type { Context } from "hono";
import { AppError } from "../../shared/errors/app-error";
import { parseInput, readJson } from "../../shared/http/validation";
import {
  profileIdSchema,
  savePreferencesRequestSchema,
  startProfileRequestSchema,
} from "./profile.schema";
import type { ProfileService } from "./profile.service";

function profileId(c: Context) {
  const value = c.req.header("X-Profile-Id");
  if (!value) {
    throw new AppError(
      "PROFILE_REQUIRED",
      "Enter your email to start using Grill-Me.",
      401,
    );
  }
  return parseInput(profileIdSchema, value);
}

export function createProfileController(service: ProfileService) {
  return {
    start: async (c: Context) => {
      const input = parseInput(
        startProfileRequestSchema,
        await readJson(c.req.raw),
      );
      return c.json({ data: await service.start(input.email) });
    },

    preferences: async (c: Context) =>
      c.json({ data: await service.getPreferences(profileId(c)) }),

    savePreferences: async (c: Context) => {
      const input = parseInput(
        savePreferencesRequestSchema,
        await readJson(c.req.raw),
      );
      return c.json({
        data: await service.savePreferences(profileId(c), input),
      });
    },
  };
}

export type ProfileController = ReturnType<typeof createProfileController>;
