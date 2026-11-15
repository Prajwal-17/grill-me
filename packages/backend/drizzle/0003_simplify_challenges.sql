-- Retired challenge fields are folded into the text and snapshot before the
-- columns are dropped, so existing practice history keeps its content.
UPDATE `challenges`
SET `problem_statement` = `problem_statement` || char(10) || char(10) || '**Constraints**' || char(10) || char(10) ||
  (SELECT group_concat('- ' || value, char(10)) FROM json_each(`challenges`.`constraints`))
WHERE `constraints` IS NOT NULL
  AND json_valid(`constraints`)
  AND json_type(`constraints`) = 'array'
  AND json_array_length(`constraints`) > 0;--> statement-breakpoint
UPDATE `challenges`
SET `problem_statement` = `problem_statement` || char(10) || char(10) || '**Starter code**' || char(10) || char(10) || '~~~~' || char(10) || trim(`starter_code`) || char(10) || '~~~~'
WHERE `starter_code` IS NOT NULL AND trim(`starter_code`) <> '';--> statement-breakpoint
UPDATE `challenges`
SET `context_snapshot` = json_set(
  CASE
    WHEN `context_snapshot` IS NULL THEN '{}'
    WHEN json_valid(`context_snapshot`) = 0 THEN '{}'
    WHEN json_type(`context_snapshot`) <> 'object' THEN '{}'
    ELSE `context_snapshot`
  END,
  '$.calibrationVersion', `calibration_version`,
  '$.contractVersion', `contract_version`
)
WHERE `calibration_version` IS NOT NULL OR `contract_version` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `challenges` DROP COLUMN `calibration_version`;--> statement-breakpoint
ALTER TABLE `challenges` DROP COLUMN `contract_version`;--> statement-breakpoint
ALTER TABLE `challenges` DROP COLUMN `completion_source`;--> statement-breakpoint
ALTER TABLE `challenges` DROP COLUMN `constraints`;--> statement-breakpoint
ALTER TABLE `challenges` DROP COLUMN `starter_code`;
