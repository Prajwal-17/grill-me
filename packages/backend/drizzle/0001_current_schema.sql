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
	`workspace_path` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "challenges_number_positive" CHECK("challenges"."challenge_number" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_profile_number_unique` ON `challenges` (`profile_id`,`challenge_number`);--> statement-breakpoint
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
	`harness_thread_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`notified_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`harness_thread_id`) REFERENCES `harness_threads`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "generation_jobs_status_check" CHECK("generation_jobs"."status" in ('queued', 'running', 'needs_input', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "generation_jobs_kind_check" CHECK("generation_jobs"."kind" in ('challenge', 'quiz', 'challenge_quiz'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_jobs_profile_request_unique` ON `generation_jobs` (`profile_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `generation_jobs_queue_idx` ON `generation_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `generation_jobs_profile_created_idx` ON `generation_jobs` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `harness_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`turn_id` text,
	`item_id` text,
	`direction` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mime` text,
	`bytes` integer,
	`sha256` text,
	`path` text,
	`url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `harness_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `harness_turns`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`item_id`) REFERENCES `harness_items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "harness_attachments_direction_check" CHECK("harness_attachments"."direction" in ('input','output')),
	CONSTRAINT "harness_attachments_kind_check" CHECK("harness_attachments"."kind" in ('image','file','url','diff','report','snapshot'))
);
--> statement-breakpoint
CREATE INDEX `harness_attachments_thread_created_idx` ON `harness_attachments` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `harness_items` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`turn_id` text,
	`attempt_id` text,
	`parent_item_id` text,
	`ordinal` integer NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`text` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `harness_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `harness_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `harness_turn_attempts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_item_id`) REFERENCES `harness_items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "harness_items_type_check" CHECK("harness_items"."type" in ('user_message','assistant_message','reasoning','command_execution','file_change','file_read','file_search','web_search','tool_call','user_input_request','approval_request','system_notice','error')),
	CONSTRAINT "harness_items_status_check" CHECK("harness_items"."status" in ('pending','running','completed','cancelled','failed')),
	CONSTRAINT "harness_items_ordinal_positive" CHECK("harness_items"."ordinal" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harness_items_thread_ordinal_unique` ON `harness_items` (`thread_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `harness_items_turn_ordinal_idx` ON `harness_items` (`turn_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `harness_items_thread_type_updated_idx` ON `harness_items` (`thread_id`,`type`,`updated_at`);--> statement-breakpoint
CREATE TABLE `harness_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`challenge_id` text,
	`parent_thread_id` text,
	`transport` text NOT NULL,
	`connection_id` text,
	`model` text NOT NULL,
	`reasoning_effort` text,
	`runtime_mode` text DEFAULT 'approval-required' NOT NULL,
	`native_thread_id` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_thread_id`) REFERENCES `harness_threads`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "harness_threads_status_check" CHECK("harness_threads"."status" in ('queued','running','waiting','completed','failed','cancelled','interrupted')),
	CONSTRAINT "harness_threads_transport_check" CHECK("harness_threads"."transport" in ('api','codex_cli','opencode_cli')),
	CONSTRAINT "harness_threads_runtime_mode_check" CHECK("harness_threads"."runtime_mode" in ('approval-required','auto-accept-edits','auto','full-access'))
);
--> statement-breakpoint
CREATE INDEX `harness_threads_profile_updated_idx` ON `harness_threads` (`profile_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `harness_threads_challenge_updated_idx` ON `harness_threads` (`challenge_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `harness_threads_status_created_idx` ON `harness_threads` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `harness_turn_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`native_thread_id` text,
	`native_turn_id` text,
	`error_code` text,
	`error_message` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`turn_id`) REFERENCES `harness_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "harness_turn_attempts_ordinal_positive" CHECK("harness_turn_attempts"."ordinal" > 0),
	CONSTRAINT "harness_turn_attempts_status_check" CHECK("harness_turn_attempts"."status" in ('queued','running','waiting','completed','failed','cancelled','interrupted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harness_turn_attempts_turn_ordinal_unique` ON `harness_turn_attempts` (`turn_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `harness_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`input_text` text NOT NULL,
	`transport` text NOT NULL,
	`connection_id` text,
	`model` text NOT NULL,
	`reasoning_effort` text,
	`runtime_mode` text NOT NULL,
	`native_turn_id` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`error_code` text,
	`error_message` text,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `harness_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "harness_turns_ordinal_positive" CHECK("harness_turns"."ordinal" > 0),
	CONSTRAINT "harness_turns_status_check" CHECK("harness_turns"."status" in ('queued','running','waiting','completed','failed','cancelled','interrupted')),
	CONSTRAINT "harness_turns_runtime_mode_check" CHECK("harness_turns"."runtime_mode" in ('approval-required','auto-accept-edits','auto','full-access'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harness_turns_thread_ordinal_unique` ON `harness_turns` (`thread_id`,`ordinal`);--> statement-breakpoint
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
CREATE TABLE `project_command_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`preparation_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`specification_hash` text NOT NULL,
	`run_token` text NOT NULL,
	`install` integer DEFAULT false NOT NULL,
	`network` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preparation_id`) REFERENCES `project_preparations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_command_authorizations_attempt_positive" CHECK("project_command_authorizations"."attempt" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_command_authorizations_preparation_unique` ON `project_command_authorizations` (`preparation_id`);--> statement-breakpoint
CREATE TABLE `project_command_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`preparation_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`specification_hash` text NOT NULL,
	`run_token` text NOT NULL,
	`purpose` text NOT NULL,
	`check_id` text,
	`command` text NOT NULL,
	`cwd` text DEFAULT '.' NOT NULL,
	`install` integer DEFAULT false NOT NULL,
	`network` integer DEFAULT false NOT NULL,
	`timeout_ms` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`authorization` text,
	`result` text,
	`decided_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preparation_id`) REFERENCES `project_preparations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_command_requests_attempt_positive" CHECK("project_command_requests"."attempt" > 0),
	CONSTRAINT "project_command_requests_timeout_positive" CHECK("project_command_requests"."timeout_ms" > 0),
	CONSTRAINT "project_command_requests_purpose_check" CHECK("project_command_requests"."purpose" in ('setup', 'check', 'run', 'inspect')),
	CONSTRAINT "project_command_requests_status_check" CHECK("project_command_requests"."status" in ('pending', 'approved', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'rejected', 'interrupted')),
	CONSTRAINT "project_command_requests_authorization_check" CHECK("project_command_requests"."authorization" is null or "project_command_requests"."authorization" in ('individual', 'attempt'))
);
--> statement-breakpoint
CREATE INDEX `project_command_requests_preparation_created_idx` ON `project_command_requests` (`preparation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `project_command_requests_preparation_status_idx` ON `project_command_requests` (`preparation_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_command_requests_running_unique` ON `project_command_requests` (`preparation_id`,`command`,`cwd`) WHERE "project_command_requests"."status" = 'running';--> statement-breakpoint
CREATE TABLE `project_preparations` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`project_directory` text NOT NULL,
	`project_path` text NOT NULL,
	`specification` text NOT NULL,
	`mode` text DEFAULT 'start' NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`run_token` text,
	`activity` text DEFAULT '[]' NOT NULL,
	`report` text,
	`error` text,
	`requested_model` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_preparations_attempt_positive" CHECK("project_preparations"."attempt" > 0),
	CONSTRAINT "project_preparations_mode_check" CHECK("project_preparations"."mode" in ('start', 'retry', 'resume', 'fresh')),
	CONSTRAINT "project_preparations_status_check" CHECK("project_preparations"."status" in ('not_started', 'running', 'ready', 'failed', 'cancelled', 'interrupted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_preparations_challenge_attempt_unique` ON `project_preparations` (`challenge_id`,`attempt`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_preparations_active_unique` ON `project_preparations` (`challenge_id`) WHERE "project_preparations"."status" in ('not_started', 'running');--> statement-breakpoint
CREATE INDEX `project_preparations_challenge_updated_idx` ON `project_preparations` (`challenge_id`,`updated_at`);--> statement-breakpoint
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
CREATE INDEX `quizzes_challenge_deleted_number_idx` ON `quizzes` (`challenge_id`,`deleted_at`,`quiz_number`);