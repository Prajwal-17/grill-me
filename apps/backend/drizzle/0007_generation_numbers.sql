-- The migrator runs this in a transaction. Block writes while backfilling and
-- seeding counters so concurrent generation cannot claim the same number.
LOCK TABLE "profiles", "challenges", "quizzes" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "generation_counters" (
	"profile_id" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "generation_counters_profile_id_kind_pk" PRIMARY KEY("profile_id","kind"),
	CONSTRAINT "generation_counters_value_check" CHECK ("generation_counters"."value" > 0),
	CONSTRAINT "generation_counters_kind_check" CHECK ("generation_counters"."kind" in ('quiz', 'challenge'))
);
--> statement-breakpoint
DROP INDEX "quizzes_challenge_number_unique";--> statement-breakpoint
DROP INDEX "quizzes_profile_number_unique";--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "quiz_number" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "generation_counters" ADD CONSTRAINT "generation_counters_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Quiz numbers previously restarted in every challenge. Merge all quiz scopes
-- into one chronological sequence per profile, including soft-deleted quizzes.
-- IDs, content, relationships, attempts, and deletion state remain unchanged.
WITH numbered AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "profile_id" ORDER BY "created_at", "id"
  )::integer AS number
  FROM "quizzes"
)
UPDATE "quizzes" SET "quiz_number" = numbered.number
FROM numbered WHERE "quizzes"."id" = numbered."id";
--> statement-breakpoint
-- Preserve valid challenge numbers. Repair any historical default-zero rows
-- after the highest existing number rather than changing established numbers.
WITH numbered AS (
  SELECT "id", (
    greatest(0, (SELECT max(c."challenge_number") FROM "challenges" c
      WHERE c."profile_id" = invalid."profile_id"))
    + row_number() OVER (PARTITION BY "profile_id" ORDER BY "created_at", "id")
  )::integer AS number
  FROM "challenges" invalid WHERE "challenge_number" <= 0
)
UPDATE "challenges" SET "challenge_number" = numbered.number
FROM numbered WHERE "challenges"."id" = numbered."id";
--> statement-breakpoint
INSERT INTO "generation_counters" ("profile_id", "kind", "value")
SELECT "profile_id", 'quiz', max("quiz_number") FROM "quizzes" GROUP BY "profile_id"
UNION ALL
SELECT "profile_id", 'challenge', max("challenge_number") FROM "challenges" GROUP BY "profile_id";
--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_profile_number_unique" ON "quizzes" USING btree ("profile_id","quiz_number");--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_number_positive" CHECK ("challenges"."challenge_number" > 0);--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_number_positive" CHECK ("quizzes"."quiz_number" > 0);
-- The atomic upsert serializes concurrent inserts for each profile and kind.
-- Counters survive record deletion, so even the highest number is never reused.
CREATE FUNCTION "public"."assign_quiz_number"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."profile_id" IS DISTINCT FROM OLD."profile_id"
      OR NEW."quiz_number" IS DISTINCT FROM OLD."quiz_number" THEN
      RAISE EXCEPTION 'Quiz generation numbers and profiles are immutable';
    END IF;
    RETURN NEW;
  END IF;
  INSERT INTO "public"."generation_counters" AS counter ("profile_id", "kind", "value")
  VALUES (NEW."profile_id", 'quiz', 1)
  ON CONFLICT ("profile_id", "kind") DO UPDATE SET "value" = counter."value" + 1
  RETURNING "value" INTO NEW."quiz_number";
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."assign_challenge_number"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."profile_id" IS DISTINCT FROM OLD."profile_id"
      OR NEW."challenge_number" IS DISTINCT FROM OLD."challenge_number" THEN
      RAISE EXCEPTION 'Challenge generation numbers and profiles are immutable';
    END IF;
    RETURN NEW;
  END IF;
  INSERT INTO "public"."generation_counters" AS counter ("profile_id", "kind", "value")
  VALUES (NEW."profile_id", 'challenge', 1)
  ON CONFLICT ("profile_id", "kind") DO UPDATE SET "value" = counter."value" + 1
  RETURNING "value" INTO NEW."challenge_number";
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "quizzes_generation_number"
BEFORE INSERT OR UPDATE OF "profile_id", "quiz_number" ON "quizzes"
FOR EACH ROW EXECUTE FUNCTION "public"."assign_quiz_number"();
--> statement-breakpoint
CREATE TRIGGER "challenges_generation_number"
BEFORE INSERT OR UPDATE OF "profile_id", "challenge_number" ON "challenges"
FOR EACH ROW EXECUTE FUNCTION "public"."assign_challenge_number"();
