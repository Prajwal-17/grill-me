import { eq } from "drizzle-orm";
import { db } from "../../shared/database/db";
import { profiles } from "../../shared/database/schema";

export type ProfileRow = typeof profiles.$inferSelect;

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

export type ProfileModel = typeof profileModel;
