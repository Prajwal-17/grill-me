CREATE TABLE `ai_log_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`log_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`log_id`) REFERENCES `ai_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_log_events_log_idx` ON `ai_log_events` (`log_id`,`id`);