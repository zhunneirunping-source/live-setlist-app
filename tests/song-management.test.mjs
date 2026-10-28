import assert from "node:assert/strict";
import test from "node:test";
import { createPlannerStore, upsertPerformance, updatePlaylistStatus, playlistSongs, renameCatalogSong, mergeCatalogSongs, findCatalogSong, loadPlannerStore, eventToArchiveSetlist, similarCatalogSongs, validatePlannerStore } from "../lib/live-planner.js";
import { PUT } from "../app/api/planner/route.ts";

const base = () => ({ ...createPlannerStore(), events: ["a", "b"].map((id) => ({ id, title: id, date: "2026-10-26", status: "attended", performances: [] })) });
const register = (store, event, artist, tracks) => upsertPerformance(store, event, artist, tracks, new Set());

test("selected song ID reuses the catalog and preserves every repeated performance", () => {
  let store = register(base(), "a", "Artist", ["Song", "Song"]);
  const id = store.songs[0].id;
  store = register(store, "b", "Artist", [{ title: "Song", songId: id }, { title: "Song", songId: id, performedTitle: "Special Song", performanceNote: "替え歌・音源なし" }]);
  assert.equal(store.songs.length, 1);
  assert.equal(playlistSongs(store).length, 1);
  assert.equal(store.events.flatMap((event) => event.performances.flatMap((p) => p.tracks)).length, 4);
  assert.equal(eventToArchiveSetlist(store.events[1], store.songs).songs[1].title, "Special Song");
  assert.equal(store.songs[0].playlistStatus, "candidate");
  assert.throws(() => register(store, "b", "Cover Artist", [{ title: "Song", songId: id }]));
});

test("processed statuses survive new setlists and unavailable requires a reason", () => {
  for (const status of ["already_added", "added", "unavailable", "dismissed"]) {
    let store = register(base(), "a", "Artist", ["Song"]);
    const id = store.songs[0].id;
    store = updatePlaylistStatus(store, id, status, undefined, status === "unavailable" ? "公開音源なし" : undefined);
    store = register(store, "b", "Artist", ["Song"]);
    assert.equal(store.songs[0].playlistStatus, status);
    assert.equal(playlistSongs(store).length, 0);
    assert.equal(playlistSongs(store, "all").length, 1);
    assert.equal(playlistSongs(updatePlaylistStatus(store, id, "candidate")).length, 1);
  }
  const store = register(base(), "a", "Artist", ["Song"]);
  assert.throws(() => updatePlaylistStatus(store, store.songs[0].id, "unavailable"));
});

test("candidate deduplication suppresses an exact duplicate of a processed song", () => {
  const store = register(base(), "a", "Artist", ["Song"]);
  store.songs.push({ ...store.songs[0], id: "duplicate" });
  assert.equal(playlistSongs(store).length, 1);
  store.songs[1].playlistStatus = "dismissed";
  assert.equal(playlistSongs(store).length, 0);
  assert.equal(playlistSongs(store, "all").length, 2);
});

test("approved spelling correction reuses the original ID and retains historical titles", () => {
  let store = register(base(), "a", "Artist", ["Surpernova"]);
  const id = store.songs[0].id;
  store = renameCatalogSong(store, id, "Supernova");
  store = register(store, "b", "Artist", ["Surpernova"]);
  assert.equal(store.songs.length, 1);
  assert.equal(findCatalogSong(store.songs, "Artist", "Surpernova").id, id);
  assert.equal(eventToArchiveSetlist(store.events[0], store.songs).songs[0].title, "Surpernova");
  assert.ok(similarCatalogSongs(store.songs, "Artist", "Supernovaa").length);
});

test("explicit merge preserves ordered repeated rows, old IDs and target status", () => {
  let store = register(base(), "a", "Artist", ["Song", "Song live", "Song live"]);
  const [target, source] = store.songs;
  store = updatePlaylistStatus(store, target.id, "already_added");
  const before = store.events[0].performances[0].tracks;
  store = mergeCatalogSongs(store, source.id, target.id);
  const after = store.events[0].performances[0].tracks;
  assert.deepEqual(after.map((track) => track.position), before.map((track) => track.position));
  assert.equal(after.length, 3);
  assert.ok(after.every((track) => track.songId === target.id));
  assert.equal(store.songs.find((song) => song.id === source.id).mergedIntoSongId, target.id);
  assert.equal(playlistSongs(store).length, 0);
  store = register(store, "b", "Artist", ["Song live"]);
  assert.equal(store.songs.length, 2);
  assert.equal(store.events[1].performances[0].tracks[0].songId, target.id);
  assert.equal(loadPlannerStore(JSON.stringify(store)).recovered, false);
});

test("covers remain separate and merging different artists is rejected", () => {
  let store = register(base(), "a", "Original", ["Same Title"]);
  store = register(store, "b", "Cover", ["Same Title"]);
  assert.equal(store.songs.length, 2);
  assert.throws(() => mergeCatalogSongs(store, store.songs[0].id, store.songs[1].id));
});

test("v1 reads upgrade losslessly, v2 round trips, invalid references fail closed", () => {
  const store = register(base(), "a", "Artist", ["Song"]);
  const old = { ...store, version: 1 };
  const loaded = loadPlannerStore(JSON.stringify(old));
  assert.deepEqual(loaded.store, store);
  assert.deepEqual(loadPlannerStore(JSON.stringify(store)).store, store);
  const dangling = structuredClone(store);
  dangling.events[0].performances[0].tracks[0].songId = "missing";
  assert.throws(() => validatePlannerStore(dangling));
  assert.equal(loadPlannerStore(JSON.stringify(dangling)).store, null);
  assert.equal(loadPlannerStore(JSON.stringify({ ...store, version: 99 })).store, null);
});

test("old-client and unknown-version writes are rejected before database access", async () => {
  for (const handler of [PUT]) for (const version of [1, 99]) {
    const response = await handler(new Request("http://localhost/api/planner", { method: handler === PUT ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ store: { ...base(), version }, revision: 1 }) }));
    assert.equal(response.status, 400);
  }
});
