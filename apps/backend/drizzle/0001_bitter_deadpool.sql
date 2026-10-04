CREATE TABLE "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"quiz_number" integer NOT NULL,
	"request_id" text NOT NULL,
	"question_count" integer NOT NULL,
	"coverage" text NOT NULL,
	"questions" jsonb NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_quiz_number_unique" ON "quiz_attempts" USING btree ("quiz_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_challenge_number_unique" ON "quizzes" USING btree ("challenge_id","quiz_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_challenge_request_unique" ON "quizzes" USING btree ("challenge_id","request_id");