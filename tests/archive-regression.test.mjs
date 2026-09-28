import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { buildArtistRanking, buildSongRanking } from "../lib/live-planner.js";

test("keeps the complete archive available to song and artist aggregation", async () => {
  const archiveUrl = new URL("../初期移行データ/", import.meta.url);
  const files = (await readdir(archiveUrl)).filter((name) => name.endsWith(".json")).sort();
  const setlists = await Promise.all(files.map(async (name, index) => {
    const raw = JSON.parse(await readFile(new URL(name, archiveUrl), "utf8"));
    return {
      id: index + 1,
      title: raw.setlist.title,
      eventType: raw.setlist.eventType,
      songs: raw.songs.map((song) => ({ title: song.title, artist: song.artist })),
    };
  }));

  assert.equal(setlists.length, 18);
  assert.equal(setlists.reduce((sum, setlist) => sum + setlist.songs.length, 0), 813);
  assert.equal(setlists.filter((setlist) => setlist.eventType === "festival").length, 14);
  assert.equal(setlists.filter((setlist) => setlist.eventType === "one_man").length, 4);
  assert.equal(setlists.filter((setlist) => setlist.eventType === "taiban").length, 0);

  const songs = setlists.flatMap((setlist) => setlist.songs);
  assert.equal(songs.filter((song) => song.artist === "ヤバイTシャツ屋さん" && song.title === "あつまれ！パーティーピーポー").length, 5);
  assert.equal(songs.filter((song) => song.title === "あつまれ!パーティーピーポー").length, 0);
  assert.equal(songs.filter((song) => song.artist === "四星球" && song.title === "Mr.Cosmo").length, 2);
  assert.equal(songs.filter((song) => song.title === "Mr.COSMO").length, 0);

  const songRanking = buildSongRanking(setlists);
  const artistRanking = buildArtistRanking(setlists);
  assert.ok(songRanking.length > 0);
  assert.ok(songRanking[0].count >= 1);
  assert.ok(artistRanking.length > 0);
  assert.ok(artistRanking[0].count >= 1);
  assert.equal(artistRanking.reduce((sum, entry) => sum + entry.count, 0) > 0, true);
});
