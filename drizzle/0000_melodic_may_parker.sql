CREATE TABLE `setlist_songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`setlist_id` integer NOT NULL,
	`song_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`cue` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`setlist_id`) REFERENCES `setlists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `setlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`venue` text DEFAULT 'TBD' NOT NULL,
	`date` text DEFAULT CURRENT_DATE NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`artist` text DEFAULT 'Unknown artist' NOT NULL,
	`key` text DEFAULT 'C' NOT NULL,
	`duration_seconds` integer DEFAULT 180 NOT NULL,
	`energy` integer DEFAULT 3 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
