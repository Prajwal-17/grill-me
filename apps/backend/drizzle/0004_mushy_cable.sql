ALTER TABLE `challenges` ADD `challenge_number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `challenges` AS `current`
SET `challenge_number` = (
	SELECT count(*)
	FROM `challenges` AS `earlier`
	WHERE `earlier`.`profile_id` = `current`.`profile_id`
		AND (
			`earlier`.`created_at` < `current`.`created_at`
			OR (
				`earlier`.`created_at` = `current`.`created_at`
				AND `earlier`.`id` <= `current`.`id`
			)
		)
);--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_profile_number_unique` ON `challenges` (`profile_id`,`challenge_number`);
