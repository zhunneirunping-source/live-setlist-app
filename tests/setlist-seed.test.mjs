import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeSetlistSeed } from "../lib/setlist-seed.js";
import { collectSeedEntries, toSql } from "../scripts/seed-setlist.mjs";

test("collects multiple setlist JSON files from a directory archive", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "setlist-archive-"));

  try {
    writeFileSync(
      path.join(tempDir, "2024-01-01_show-a.json"),
      JSON.stringify({
        setlist: { title: "Show A", venue: "Venue A", date: "2024-01-01", notes: "" },
        songs: [
          { title: "Song 1", artist: "Artist 1", key: "A", duration: "3:00", energy: 4, position: 1, notes: "" },
          { title: "Song 2", artist: "Artist 2", key: "B", duration: "4:00", energy: 3, position: 2, notes: "" },
        ],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(tempDir, "2024-01-02_show-b.json"),
      JSON.stringify({
        setlist: { title: "Show B", venue: "Venue B", date: "2024-01-02", notes: "" },
        songs: [
          { title: "Song 3", artist: "Artist 3", key: "C", duration: "2:30", energy: 5, position: 1, notes: "" },
        ],
      }),
      "utf8",
    );

    const entries = await collectSeedEntries(tempDir);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].setlist.title, "Show A");
    assert.equal(entries[1].songs.length, 1);
    assert.equal(entries.reduce((sum, entry) => sum + entry.songs.length, 0), 3);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("writes setlist-song relationships into the SQL seed", async () => {
  const seed = {
    setlist: {
      title: "Harbor Lights",
      venue: "The Lantern Room",
      date: "2026-09-19",
      notes: "Opening set / encore request",
    },
    songs: [
      {
        title: "Midnight Echo",
        artist: "Atlas Bloom",
        key: "A",
        duration: "3:42",
        energy: 4,
        position: 1,
        notes: "Start with full-band groove",
      },
      {
        title: "Glass Horizon",
        artist: "Nova Harbor",
        key: "D",
        durationSeconds: 258,
        energy: 5,
        position: 2,
        notes: "Big chorus",
      },
    ],
  };

  const sql = toSql([normalizeSetlistSeed(seed)]);

  assert.match(sql, /INSERT INTO setlist_songs/i);
  assert.match(sql, /setlist_id.*song_id/i);
});

test("normalizes the provided setlist JSON payload into app-ready songs", () => {
  const seed = {
    setlist: {
      title: "Harbor Lights",
      venue: "The Lantern Room",
      date: "2026-09-19",
      notes: "Opening set / encore request",
    },
    songs: [
      {
        title: "Midnight Echo",
        artist: "Atlas Bloom",
        key: "A",
        duration: "3:42",
        energy: 4,
        position: 1,
        notes: "Start with full-band groove",
      },
      {
        title: "Glass Horizon",
        artist: "Nova Harbor",
        key: "D",
        durationSeconds: 258,
        energy: 5,
        position: 2,
        notes: "Big chorus",
      },
    ],
  };

  const normalized = normalizeSetlistSeed(seed);

  assert.equal(normalized.setlist.title, "Harbor Lights");
  assert.equal(normalized.setlist.venue, "The Lantern Room");
  assert.equal(normalized.songs.length, 2);
  assert.deepEqual(normalized.songs[0], {
    id: 1,
    title: "Midnight Echo",
    artist: "Atlas Bloom",
    key: "A",
    duration: "3:42",
    durationSeconds: 222,
    energy: 4,
    position: 1,
    notes: "Start with full-band groove",
  });
  assert.deepEqual(normalized.songs[1], {
    id: 2,
    title: "Glass Horizon",
    artist: "Nova Harbor",
    key: "D",
    duration: "4:18",
    durationSeconds: 258,
    energy: 5,
    position: 2,
    notes: "Big chorus",
  });
});
