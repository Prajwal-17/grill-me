CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`root` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE `challenges` ADD `estimated_difficulty_score` integer;--> statement-breakpoint
ALTER TABLE `challenges` ADD `difficulty_reason` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `topic` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `implementation_boundary` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `context_snapshot` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `prompt_version` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `calibration_version` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `contract_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `challenges` ADD `completion_source` text;
--> statement-breakpoint
UPDATE challenges SET completion_source = 'legacy' WHERE status = 'completed';
