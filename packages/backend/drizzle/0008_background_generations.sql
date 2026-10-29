CREATE TABLE "generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"challenge_id" text,
	"request" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"clarification" jsonb,
	"error" jsonb,
	"result_id" text,
	"result_title" text,
	"result_number" integer,
	"skip_preparation" boolean DEFAULT false NOT NULL,
	"run_token" text,
	"lease_until" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"notified_at" timestamp,
	CONSTRAINT "generation_jobs_status_check" CHECK ("generation_jobs"."status" in ('queued', 'running', 'needs_input', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "generation_jobs_kind_check" CHECK ("generation_jobs"."kind" in ('challenge', 'quiz', 'challenge_quiz'))
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_profile_request_unique" ON "generation_jobs" USING btree ("profile_id","request_id");--> statement-breakpoint
CREATE INDEX "generation_jobs_queue_idx" ON "generation_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_profile_created_idx" ON "generation_jobs" USING btree ("profile_id","created_at");