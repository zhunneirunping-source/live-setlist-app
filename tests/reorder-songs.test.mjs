import assert from "node:assert/strict";
import test from "node:test";
import { applyNonTransactionalReorder, validateReorderPayload } from "../lib/reorder-songs.js";

const items = [
  { id: 1, title: "One", artist: "Artist", key: "C", duration: "3:00", energy: 3 },
  { id: 2, title: "Two", artist: "Artist", key: "D", duration: "4:00", energy: 4 },
];

test("rejects malformed and duplicate reorder payloads before writes", () => {
  assert.equal(validateReorderPayload(0, items), "setlistId is required");
  assert.equal(validateReorderPayload(1, null), "songs must be an array");
  assert.equal(validateReorderPayload(1, [{ ...items[0], title: "" }]), "each song must have title, artist, key, and duration");
  assert.equal(validateReorderPayload(1, [items[0], { ...items[1], id: 1 }]), "song ids must be unique");
});

test("does not start relationship updates when the song phase fails", async () => {
  const songWrites = [];
  const relationshipWrites = [];

  await assert.rejects(() => applyNonTransactionalReorder(
    items,
    async (item) => {
      songWrites.push(item.id);
      if (item.id === 2) throw new Error("song update failed");
    },
    async (item) => { relationshipWrites.push(item.id); },
  ), /song update failed/);

  assert.deepEqual(songWrites, [1, 2]);
  assert.deepEqual(relationshipWrites, []);
});

test("can be retried to converge after a partial relationship failure", async () => {
  const positions = new Map();
  let failOnce = true;
  const updateSong = async () => {};
  const updateMembership = async (item, index) => {
    if (item.id === 2 && failOnce) {
      failOnce = false;
      throw new Error("relationship update failed");
    }
    positions.set(item.id, index);
  };

  await assert.rejects(() => applyNonTransactionalReorder(items, updateSong, updateMembership), /relationship update failed/);
  assert.equal(positions.get(1), 0);
  assert.equal(positions.has(2), false);

  await applyNonTransactionalReorder(items, updateSong, updateMembership);
  assert.deepEqual([...positions.entries()], [[1, 0], [2, 1]]);
});
