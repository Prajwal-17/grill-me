import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const profilePreferences = sqliteTable("profile_preferences", {
  profileId: text("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  experienceLevel: text("experience_level"),
  languagesStack: text("languages_stack"),
  learningGoals: text("learning_goals"),
  preferredDuration: integer("preferred_duration").notNull().default(60),
  difficulty: text("difficulty", {
    enum: ["easy", "balanced", "challenging"],
  })
    .notNull()
    .default("balanced"),
  aboutMe: text("about_me"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const challenges = sqliteTable("challenges", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type", {
    enum: ["exercise", "question", "architecture", "mini-project"],
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
});

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
  attachments: text("attachments", { mode: "json" })
    .$type<{ filename: string; text: string }[]>()
    .notNull()
    .default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
