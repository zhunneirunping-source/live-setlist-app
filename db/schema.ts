import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const setlists = sqliteTable("setlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  venue: text("venue").notNull().default("TBD"),
  date: text("date").notNull().default(sql`CURRENT_DATE`),
  notes: text("notes").notNull().default(""),
});

export const songs = sqliteTable("songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  artist: text("artist").notNull().default("Unknown artist"),
  key: text("key"),
  durationSeconds: integer("duration_seconds"),
  energy: integer("energy"),
  position: integer("position").notNull().default(0),
  notes: text("notes").notNull().default(""),
});

export const setlistSongs = sqliteTable("setlist_songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  setlistId: integer("setlist_id")
    .notNull()
    .references(() => setlists.id),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id),
  position: integer("position").notNull().default(0),
  cue: text("cue").notNull().default(""),
});

export const plannerState = sqliteTable("planner_state", {
  id: integer("id").primaryKey(),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const plannerMigrations = sqliteTable("planner_migrations", {
  migrationKey: text("migration_key").primaryKey(),
  importedBy: text("imported_by").notNull(),
  importedAt: text("imported_at").notNull(),
});
