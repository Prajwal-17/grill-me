import type { ProfileRow } from "./profile.model";
import { profileSchema, type Profile } from "./profile.schema";

export function toProfile(row: ProfileRow): Profile {
  return profileSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}
