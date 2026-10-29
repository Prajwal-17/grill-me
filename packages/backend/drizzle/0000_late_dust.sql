CREATE TABLE "ai_log_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_id" text NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"challenge_id" text,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"requested_model" text NOT NULL,
	"actual_model" text,
	"endpoint" text NOT NULL,
	"provider_request_id" text,
	"streamed" boolean NOT NULL,
	"preview" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer,
	"first_token_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"cached_tokens" integer,
	"reasoning_tokens" integer,
	"cost_usd" double precision,
	"request_body" jsonb NOT NULL,
	"response_body" jsonb,
	"response_text" text DEFAULT '' NOT NULL,
	"stream_events" jsonb,
	"error" jsonb
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"challenge_number" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"difficulty" text NOT NULL,
	"estimated_difficulty_score" integer,
	"difficulty_reason" text,
	"topic" text,
	"implementation_boundary" text,
	"context_snapshot" jsonb,
	"prompt_version" text,
	"calibration_version" text,
	"contract_version" integer DEFAULT 1 NOT NULL,
	"completion_source" text,
	"contextual_difficulty" text NOT NULL,
	"duration_min_minutes" integer NOT NULL,
	"duration_max_minutes" integer NOT NULL,
	"implementation_milestones" jsonb NOT NULL,
	"problem_statement" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"constraints" jsonb NOT NULL,
	"starter_code" text,
	"completion_criteria" jsonb NOT NULL,
	"hint" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"role" text NOT NULL,
	"mode" text NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_preferences" (
	"profile_id" text PRIMARY KEY NOT NULL,
	"guided_preferences" jsonb NOT NULL,
	"about_me" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"name" text NOT NULL,
	"root" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"judge" text NOT NULL,
	"routing_reason" text NOT NULL,
	"status" text NOT NULL,
	"progress" text NOT NULL,
	"response" jsonb,
	"score" integer,
	"error" text,
	"followup" text,
	"ai_log_id" text,
	"provider_thread_id" text,
	"provider_turn_id" text,
	"prompt_version" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"contract_version" integer NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb NOT NULL,
	"project_id" text,
	"snapshot_path" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"git_context" jsonb,
	"assistance" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_log_events" ADD CONSTRAINT "ai_log_events_log_id_ai_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."ai_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_preferences" ADD CONSTRAINT "profile_preferences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_jobs" ADD CONSTRAINT "review_jobs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_review_id_review_jobs_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_log_events_log_idx" ON "ai_log_events" USING btree ("log_id","id");--> statement-breakpoint
CREATE INDEX "ai_logs_profile_started_idx" ON "ai_logs" USING btree ("profile_id","started_at","id");--> statement-breakpoint
CREATE INDEX "ai_logs_profile_status_idx" ON "ai_logs" USING btree ("profile_id","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_profile_number_unique" ON "challenges" USING btree ("profile_id","challenge_number");