CREATE TABLE `profile_preferences` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`experience_level` text,
	`languages_stack` text,
	`learning_goals` text,
	`preferred_duration` integer DEFAULT 60 NOT NULL,
	`difficulty` text DEFAULT 'balanced' NOT NULL,
	`about_me` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `attachments` text DEFAULT '[]' NOT NULL;