CREATE TABLE `draw_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lottery_id` integer NOT NULL,
	`external_result_id` text NOT NULL,
	`draw_date` text NOT NULL,
	`draw_datetime` text,
	`weekday` integer NOT NULL,
	`calendar_week` integer NOT NULL,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`first_number` text NOT NULL,
	`second_number` text NOT NULL,
	`third_number` text NOT NULL,
	`source` text NOT NULL,
	`source_payload` text,
	`collected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lotteries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draw_results_lottery_external_unique` ON `draw_results` (`lottery_id`,`external_result_id`);--> statement-breakpoint
CREATE INDEX `draw_results_date_idx` ON `draw_results` (`draw_date`);--> statement-breakpoint
CREATE INDEX `draw_results_period_idx` ON `draw_results` (`lottery_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `lotteries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_game_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`source` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lotteries_external_game_id_unique` ON `lotteries` (`external_game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lotteries_slug_unique` ON `lotteries` (`slug`);--> statement-breakpoint
CREATE TABLE `prediction_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prediction_id` integer NOT NULL,
	`number` text NOT NULL,
	`ranking` integer NOT NULL,
	`score` real NOT NULL,
	`monthly_score` real DEFAULT 0 NOT NULL,
	`weekly_score` real DEFAULT 0 NOT NULL,
	`weekday_score` real DEFAULT 0 NOT NULL,
	`position_score` real DEFAULT 0 NOT NULL,
	`coincidence_score` real DEFAULT 0 NOT NULL,
	`recency_score` real DEFAULT 0 NOT NULL,
	`explanation` text NOT NULL,
	FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_candidates_rank_unique` ON `prediction_candidates` (`prediction_id`,`ranking`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lottery_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`data_available_through` text NOT NULL,
	`method_version` text NOT NULL,
	`method_parameters` text NOT NULL,
	`status` text DEFAULT 'generated' NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lotteries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `predictions_week_idx` ON `predictions` (`week_start`,`week_end`);