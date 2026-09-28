CREATE TABLE IF NOT EXISTS `planner_state` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `document` text NOT NULL,
  `revision` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `planner_migrations` (
  `migration_key` text PRIMARY KEY NOT NULL,
  `imported_by` text NOT NULL,
  `imported_at` text NOT NULL
);
