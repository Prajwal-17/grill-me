import { eq } from "drizzle-orm";
import { db } from "../../shared/database/db";
import { profilePreferences, profiles } from "../../shared/database/schema";
import type { SavePreferencesInput } from "./profile.schema";

export type ProfileRow = typeof profiles.$inferSelect;
export type ProfilePreferencesRow = typeof profilePreferences.$inferSelect;

export const profileModel = {
  findByEmail(email: string) {
    return db.select().from(profiles).where(eq(profiles.email, email)).get();
  },

  findById(id: string) {
    return db.select().from(profiles).where(eq(profiles.id, id)).get();
  },

  create(email: string) {
    return db
      .insert(profiles)
      .values({ id: crypto.randomUUID(), email })
      .returning()
      .get();
  },
};

export const profilePreferencesModel = {
  findByProfileId(profileId: string) {
    return db
      .select()
      .from(profilePreferences)
      .where(eq(profilePreferences.profileId, profileId))
      .get();
  },

  createDefaults(profileId: string) {
    return db
      .insert(profilePreferences)
      .values({ profileId })
      .onConflictDoNothing()
      .returning()
      .get();
  },

  save(profileId: string, input: SavePreferencesInput) {
    const now = new Date();
    const { preferredDuration, difficulty, aboutMe, ...guidedPreferences } =
      input;
    const values = {
      preferredDuration,
      difficulty,
      aboutMe,
      guidedPreferences,
    };
    return db
      .insert(profilePreferences)
      .values({ profileId, ...values, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: profilePreferences.profileId,
        set: { ...values, updatedAt: now },
      })
      .returning()
      .get();
  },
};

export type ProfileModel = typeof profileModel;
export type ProfilePreferencesModel = typeof profilePreferencesModel;
