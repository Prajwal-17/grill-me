ALTER TABLE "quizzes" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "quizzes_profile_deleted_number_idx" ON "quizzes" USING btree ("profile_id","deleted_at","quiz_number");--> statement-breakpoint
CREATE INDEX "quizzes_challenge_deleted_number_idx" ON "quizzes" USING btree ("challenge_id","deleted_at","quiz_number");