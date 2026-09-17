import { eq } from "drizzle-orm";
import { EMPTY_GUIDED } from "@repo/preferences";
import { db, first } from "../../shared/database/db";
import { profilePreferences, profiles } from "../../shared/database/schema";
import type { SavePreferencesInput } from "./profile.schema";

export type ProfileRow = typeof profiles.$inferSelect;
export type ProfilePreferencesRow = typeof profilePreferences.$inferSelect;

export const profileModel = {
  findByEmail(email: string) {
    return first(db.select().from(profiles).where(eq(profiles.email, email)));
  },

  findById(id: string) {
    return first(db.select().from(profiles).where(eq(profiles.id, id)));
  },

  create(email: string) {
    return first(
      db
        .insert(profiles)
        .values({ id: crypto.randomUUID(), email })
        .returning(),
    );
  },
};

export const profilePreferencesModel = {
  findByProfileId(profileId: string) {
    return first(
      db
        .select()
        .from(profilePreferences)
        .where(eq(profilePreferences.profileId, profileId)),
    );
  },

  createDefaults(profileId: string) {
    return first(
      db
        .insert(profilePreferences)
        .values({ profileId, guidedPreferences: EMPTY_GUIDED })
        .onConflictDoNothing()
        .returning(),
    );
  },

  save(profileId: string, input: SavePreferencesInput) {
    const now = new Date();
    const { aboutMe, ...guidedPreferences } = input;
    const values = {
      aboutMe,
      guidedPreferences,
    };
    return first(
      db
        .insert(profilePreferences)
        .values({ profileId, ...values, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: profilePreferences.profileId,
          set: { ...values, updatedAt: now },
        })
        .returning(),
    );
  },
};

export type ProfileModel = typeof profileModel;
export type ProfilePreferencesModel = typeof profilePreferencesModel;
