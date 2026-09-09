ALTER TABLE `predictions` ADD `iso_year` integer NOT NULL DEFAULT 0;
ALTER TABLE `predictions` ADD `iso_week` integer NOT NULL DEFAULT 0;
ALTER TABLE `predictions` ADD `projection_kind` text NOT NULL DEFAULT 'unspecified';
CREATE UNIQUE INDEX `predictions_freeze_unique` ON `predictions` (`lottery_id`,`week_start`,`week_end`,`method_version`);

ALTER TABLE `prediction_candidates` ADD `scope` text NOT NULL DEFAULT 'weekly';
ALTER TABLE `prediction_candidates` ADD `target_date` text NOT NULL DEFAULT '';
ALTER TABLE `prediction_candidates` ADD `weekday` integer;
ALTER TABLE `prediction_candidates` ADD `total_count` integer NOT NULL DEFAULT 0;
ALTER TABLE `prediction_candidates` ADD `year_support` integer NOT NULL DEFAULT 0;
ALTER TABLE `prediction_candidates` ADD `day_recurrence_count` integer NOT NULL DEFAULT 0;
ALTER TABLE `prediction_candidates` ADD `exact_position_recurrence_count` integer NOT NULL DEFAULT 0;
ALTER TABLE `prediction_candidates` ADD `position_counts` text NOT NULL DEFAULT '[0,0,0]';
ALTER TABLE `prediction_candidates` ADD `years` text NOT NULL DEFAULT '[]';
DROP INDEX IF EXISTS `prediction_candidates_rank_unique`;
CREATE UNIQUE INDEX `prediction_candidates_scope_rank_unique` ON `prediction_candidates` (`prediction_id`,`scope`,`target_date`,`ranking`);
