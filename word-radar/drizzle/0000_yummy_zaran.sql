CREATE TABLE `radar_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radar_records` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_records_dedupe_unique` ON `radar_records` (`dedupe`);--> statement-breakpoint
CREATE TABLE `radar_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radar_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`snapshot` text,
	`locked_until` integer DEFAULT 0 NOT NULL
);
