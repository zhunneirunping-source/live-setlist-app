import assert from "node:assert/strict";
import test from "node:test";
import { readSongCache, readSongCacheFromStorage, SONG_CACHE_VERSION, writeSongCache } from "../lib/song-cache.js";

const song = { id: 1, title: "Song", artist: "Artist", key: "C", duration: "3:30", energy: 3 };

test("returns null for missing, malformed, and unsupported cache values", () => {
  assert.equal(readSongCache(null), null);
  assert.equal(readSongCache("{"), null);
  assert.equal(readSongCache(JSON.stringify({ version: 99, songs: [song] })), null);
  assert.equal(readSongCache(JSON.stringify({ version: SONG_CACHE_VERSION, songs: "invalid" })), null);
});

test("migrates the legacy array format without losing valid songs", () => {
  assert.deepEqual(readSongCache(JSON.stringify([song])), {
    version: SONG_CACHE_VERSION,
    setlistId: 0,
    songs: [song],
    migratedFromLegacy: true,
  });
});

test("salvages valid songs from partial data and fills optional fields", () => {
  const cached = readSongCache(JSON.stringify({
    version: SONG_CACHE_VERSION,
    setlistId: 7,
    songs: [song, null, { id: 2, title: "Partial", artist: "Artist" }, { id: -1, title: "Bad", artist: "Artist" }],
  }));

  assert.equal(cached.setlistId, 7);
  assert.equal(cached.songs.length, 2);
  assert.deepEqual(cached.songs[1], { id: 2, title: "Partial", artist: "Artist", key: "—", duration: "—", energy: 0 });
});

test("contains storage read and write failures", () => {
  const failingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
  };
  assert.equal(readSongCacheFromStorage(failingStorage, "songs"), null);
  assert.equal(writeSongCache(failingStorage, "songs", 1, [song]), false);
});

test("writes the current versioned envelope", () => {
  let value = "";
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
  assert.equal(writeSongCache(storage, "songs", 9, [song]), true);
  assert.deepEqual(readSongCacheFromStorage(storage, "songs"), {
    version: SONG_CACHE_VERSION,
    setlistId: 9,
    songs: [song],
    migratedFromLegacy: false,
  });
});
