CREATE TABLE IF NOT EXISTS `watchlist_state` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `document` text NOT NULL,
  `revision` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
