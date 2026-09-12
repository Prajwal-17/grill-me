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
CREATE INDEX `ai_logs_profile_status_idx` ON `ai_logs` (`profile_id`,`status`,`started_at`);