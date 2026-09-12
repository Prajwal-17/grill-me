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
	`title` text NOT NULL,
	`scope` text NOT NULL,
	`difficulty` text NOT NULL,
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
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);