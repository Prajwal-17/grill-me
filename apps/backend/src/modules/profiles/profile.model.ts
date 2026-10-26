import { eq } from "drizzle-orm";
import { EMPTY_GUIDED } from "@repo/preferences";
import { db, first } from "../../shared/database/db";
import { profilePreferences, profiles } from "../../shared/database/schema";
import {
  guidedPreferencesSchema,
  type SavePreferencesInput,
} from "./profile.schema";

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
    return db.transaction(async (tx) => {
      await tx
        .insert(profilePreferences)
        .values({ profileId, guidedPreferences: EMPTY_GUIDED })
        .onConflictDoNothing();
      const previous = (
        await tx
          .select()
          .from(profilePreferences)
          .where(eq(profilePreferences.profileId, profileId))
          .for("update")
      )[0]!;
      const prior = guidedPreferencesSchema.parse(previous.guidedPreferences);
      const { aboutMe: suppliedBackground, ...incoming } = input;
      const aboutMe =
        suppliedBackground === undefined
          ? previous.aboutMe
          : suppliedBackground;
      const guidedPreferences = guidedPreferencesSchema.parse({
        ...prior,
        ...Object.fromEntries(
          Object.entries(incoming).filter(([, value]) => value !== undefined),
        ),
      });
      const developerInfo = (
        guided: typeof guidedPreferences,
        background: string | null,
      ) => {
        const {
          codexModel: _model,
          includeRecentChallenges: _sharing,
          ...developer
        } = guided;
        return JSON.stringify({ ...developer, aboutMe: background });
      };
      const now = new Date();
      const changed =
        developerInfo(prior, previous.aboutMe) !==
        developerInfo(guidedPreferences, aboutMe);
      return (
        await tx
          .update(profilePreferences)
          .set({
            aboutMe,
            guidedPreferences,
            updatedAt: now,
            developerContextUpdatedAt: changed
              ? new Date(
                  Math.max(
                    now.getTime(),
                    (previous.developerContextUpdatedAt?.getTime() ?? 0) + 1,
                  ),
                )
              : previous.developerContextUpdatedAt,
          })
          .where(eq(profilePreferences.profileId, profileId))
          .returning()
      )[0];
    });
  },
};

export type ProfileModel = typeof profileModel;
export type ProfilePreferencesModel = typeof profilePreferencesModel;
