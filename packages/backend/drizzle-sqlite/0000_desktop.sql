CREATE TABLE `ai_log_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`log_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`log_id`) REFERENCES `ai_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_log_events_log_idx` ON `ai_log_events` (`log_id`,`id`);--> statement-breakpoint
CREATE TABLE `ai_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`challenge_id` text,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`requested_model` text NOT NULL,
	`actual_model` text,
	`endpoint` text NOT NULL,
	`provider_request_id` text,
	`streamed` integer NOT NULL,
	`preview` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration_ms` integer,
	`first_token_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`cached_tokens` integer,
	`reasoning_tokens` integer,
	`cost_usd` real,
	`request_body` text NOT NULL,
	`response_body` text,
	`response_text` text DEFAULT '' NOT NULL,
	`stream_events` text,
	`error` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_logs_profile_started_idx` ON `ai_logs` (`profile_id`,`started_at`,`id`);--> statement-breakpoint
CREATE INDEX `ai_logs_profile_status_idx` ON `ai_logs` (`profile_id`,`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`challenge_number` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`scope` text NOT NULL,
	`difficulty` text NOT NULL,
	`estimated_difficulty_score` integer,
	`difficulty_reason` text,
	`topic` text,
	`implementation_boundary` text,
	`context_snapshot` text,
	`prompt_version` text,
	`calibration_version` text,
	`contract_version` integer DEFAULT 1 NOT NULL,
	`completion_source` text,
	`contextual_difficulty` text NOT NULL,
	`duration_min_minutes` integer NOT NULL,
	`duration_max_minutes` integer NOT NULL,
	`implementation_milestones` text NOT NULL,
	`problem_statement` text NOT NULL,
	`expected_outcome` text NOT NULL,
	`constraints` text NOT NULL,
	`starter_code` text,
	`completion_criteria` text NOT NULL,
	`hint` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "challenges_number_positive" CHECK("challenges"."challenge_number" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_profile_number_unique` ON `challenges` (`profile_id`,`challenge_number`);--> statement-breakpoint
CREATE TABLE `generation_counters` (
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `kind`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "generation_counters_value_check" CHECK("generation_counters"."value" > 0),
	CONSTRAINT "generation_counters_kind_check" CHECK("generation_counters"."kind" in ('quiz', 'challenge'))
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`challenge_id` text,
	`request` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`phase` text DEFAULT 'queued' NOT NULL,
	`clarification` text,
	`error` text,
	`result_id` text,
	`result_title` text,
	`result_number` integer,
	`skip_preparation` integer DEFAULT false NOT NULL,
	`run_token` text,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`notified_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "generation_jobs_status_check" CHECK("generation_jobs"."status" in ('queued', 'running', 'needs_input', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "generation_jobs_kind_check" CHECK("generation_jobs"."kind" in ('challenge', 'quiz', 'challenge_quiz'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_jobs_profile_request_unique` ON `generation_jobs` (`profile_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `generation_jobs_queue_idx` ON `generation_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `generation_jobs_profile_created_idx` ON `generation_jobs` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`role` text NOT NULL,
	`mode` text NOT NULL,
	`content` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_preferences` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`guided_preferences` text NOT NULL,
	`about_me` text,
	`developer_context_updated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`root` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`score` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_quiz_number_unique` ON `quiz_attempts` (`quiz_id`,`attempt_number`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`challenge_id` text,
	`topic` text,
	`title` text,
	`difficulty` text,
	`quiz_number` integer DEFAULT 0 NOT NULL,
	`request_id` text NOT NULL,
	`question_count` integer NOT NULL,
	`coverage` text NOT NULL,
	`questions` text NOT NULL,
	`context_snapshot` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quizzes_number_positive" CHECK("quizzes"."quiz_number" > 0),
	CONSTRAINT "quizzes_scope_check" CHECK(("quizzes"."challenge_id" is not null and "quizzes"."coverage" in ('challenge', 'related', 'mixed')) or ("quizzes"."challenge_id" is null and "quizzes"."coverage" = 'topic' and "quizzes"."topic" is not null and "quizzes"."difficulty" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quizzes_challenge_request_unique` ON `quizzes` (`challenge_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quizzes_profile_number_unique` ON `quizzes` (`profile_id`,`quiz_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `quizzes_profile_request_unique` ON `quizzes` (`profile_id`,`request_id`) WHERE "quizzes"."challenge_id" is null;--> statement-breakpoint
CREATE INDEX `quizzes_profile_deleted_number_idx` ON `quizzes` (`profile_id`,`deleted_at`,`quiz_number`);--> statement-breakpoint
CREATE INDEX `quizzes_challenge_deleted_number_idx` ON `quizzes` (`challenge_id`,`deleted_at`,`quiz_number`);--> statement-breakpoint
CREATE TABLE `review_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`judge` text NOT NULL,
	`routing_reason` text NOT NULL,
	`status` text NOT NULL,
	`progress` text NOT NULL,
	`response` text,
	`score` integer,
	`error` text,
	`followup` text,
	`ai_log_id` text,
	`provider_thread_id` text,
	`provider_turn_id` text,
	`prompt_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`contract_version` integer NOT NULL,
	`content` text NOT NULL,
	`attachments` text NOT NULL,
	`project_id` text,
	`snapshot_path` text NOT NULL,
	`manifest` text NOT NULL,
	`git_context` text,
	`assistance` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `verification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `review_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
