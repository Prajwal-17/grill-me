ALTER TABLE "quizzes" ALTER COLUMN "challenge_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "profile_id" text;--> statement-breakpoint
UPDATE "quizzes" SET "profile_id" = "challenges"."profile_id" FROM "challenges" WHERE "quizzes"."challenge_id" = "challenges"."id";--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "difficulty" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_profile_number_unique" ON "quizzes" USING btree ("profile_id","quiz_number") WHERE "quizzes"."challenge_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_profile_request_unique" ON "quizzes" USING btree ("profile_id","request_id") WHERE "quizzes"."challenge_id" is null;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_scope_check" CHECK (("quizzes"."challenge_id" is not null and "quizzes"."coverage" in ('challenge', 'related', 'mixed')) or ("quizzes"."challenge_id" is null and "quizzes"."coverage" = 'topic' and "quizzes"."topic" is not null and "quizzes"."difficulty" is not null));
