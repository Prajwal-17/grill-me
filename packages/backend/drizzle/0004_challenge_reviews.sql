CREATE TABLE `challenge_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`verdict` text NOT NULL,
	`criteria_met` integer NOT NULL,
	`criteria_total` integer NOT NULL,
	`result` text NOT NULL,
	`model` text NOT NULL,
	`thread_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "challenge_reviews_verdict_check" CHECK("challenge_reviews"."verdict" in ('meets','partly_meets','does_not_meet')),
	CONSTRAINT "challenge_reviews_counts_check" CHECK("challenge_reviews"."criteria_met" between 0 and "challenge_reviews"."criteria_total" and "challenge_reviews"."criteria_total" > 0)
);
--> statement-breakpoint
CREATE INDEX `challenge_reviews_challenge_created_idx` ON `challenge_reviews` (`challenge_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `challenge_reviews_profile_created_idx` ON `challenge_reviews` (`profile_id`,`created_at`);