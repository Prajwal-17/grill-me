import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const challenges = sqliteTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: text("type", {
      enum: ["exercise", "architecture", "mini-project"],
    }).notNull(),
    problemStatement: text("problem_statement").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    constraints: text("constraints", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    starterCode: text("starter_code"),
    completionCriteria: text("completion_criteria", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    hint: text("hint"),
    status: text("status", { enum: ["active", "completed"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("one_active_challenge_per_profile")
      .on(table.profileId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  mode: text("mode", {
    enum: ["generate", "clarify", "review", "hint"],
  }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
