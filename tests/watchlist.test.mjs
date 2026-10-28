import assert from "node:assert/strict";
import test from "node:test";
import { WATCH_GENRES, createWatchStore, saveWatchTarget, validateWatchStore, watchCandidates, addWatchCandidates } from "../lib/watchlist.js";

test("all five genres, priorities, edits, removal and normalized duplicates", () => {
  let store = createWatchStore();
  for (const genre of Object.keys(WATCH_GENRES)) store = saveWatchTarget(store, { name: "Ａrtist", genre, priority: "normal" });
  assert.equal(store.targets.length, 5);
  assert.throws(() => saveWatchTarget(store, { name: " artist ", genre: "music", priority: "normal" }), /登録済み/);
  const first = store.targets[0];
  store = saveWatchTarget(store, { ...first, name: "新しい名前", priority: "important" });
  assert.equal(store.targets[0].id, first.id);
  assert.equal(store.targets[0].createdAt, first.createdAt);
  assert.equal(store.targets[0].priority, "important");
  assert.equal(validateWatchStore({ ...store, targets: store.targets.slice(1) }).targets.length, 4);
  for (const change of [{ name: " " }, { name: "a".repeat(201) }, { genre: "__proto__" }, { priority: "unknown" }, { id: "missing" }]) {
    assert.throws(() => saveWatchTarget(store, { name: "new", genre: "music", priority: "normal", ...change }));
  }
  assert.throws(() => validateWatchStore({ ...store, targets: [...store.targets, store.targets[0]] }));
  assert.throws(() => validateWatchStore({ ...store, version: 2 }));
});

test("only observed performers are candidates; no auto-registration or changes to history", () => {
  const planner = { events: [
    { status: "attended", artists: ["Unseen"], performances: [{ artistName: "Observed", tracks: [] }] },
    { status: "confirmed", artists: ["Future"], performances: [{ artistName: "Future" }] },
    { status: "cancelled", performances: [{ artistName: "Cancelled" }] },
  ], songs: [{ displayArtist: "Cover original" }] };
  const archive = [{ songs: [{ artist: "Ｏbserved" }, { artist: "Archive performer" }, { artist: "Unknown artist" }] }];
  const before = JSON.stringify({ planner, archive });
  const empty = createWatchStore();
  const candidates = watchCandidates(planner, archive, empty);
  assert.deepEqual(candidates, ["Archive performer", "Observed"]);
  assert.deepEqual(empty.targets, []);
  const registered = addWatchCandidates(empty, ["Observed", "Ｏbserved", "Future"], candidates, "important");
  assert.equal(registered.targets.length, 1);
  assert.equal(registered.targets[0].priority, "important");
  assert.deepEqual(watchCandidates(planner, archive, registered), ["Archive performer"]);
  assert.deepEqual(addWatchCandidates(registered, ["Observed"], candidates), registered);
  assert.equal(JSON.stringify({ planner, archive }), before);
});
