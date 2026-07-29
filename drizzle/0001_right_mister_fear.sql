CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`status` text NOT NULL,
	`records_created` integer DEFAULT 0 NOT NULL,
	`records_updated` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_started_idx` ON `sync_runs` (`started_at`);