export function validateReorderPayload(setlistId, items) {
  if (!Number.isInteger(setlistId) || setlistId <= 0) return "setlistId is required";
  if (!Array.isArray(items)) return "songs must be an array";

  const ids = new Set();
  for (const item of items) {
    if (!item || !Number.isInteger(item.id) || item.id <= 0) return "each song must have a valid id";
    if (ids.has(item.id)) return "song ids must be unique";
    ids.add(item.id);
    if (![item.title, item.artist, item.key, item.duration].every((value) => typeof value === "string" && value.trim())) {
      return "each song must have title, artist, key, and duration";
    }
    if (!Number.isFinite(Number(item.energy))) return "each song must have a numeric energy";
  }

  return null;
}

// D1 does not currently expose a transaction here. Keeping the two phases in one
// helper makes the partial-failure boundary explicit and retry-testable.
export async function applyNonTransactionalReorder(items, updateSong, updateMembership) {
  await Promise.all(items.map((item, index) => updateSong(item, index)));
  await Promise.all(items.map((item, index) => updateMembership(item, index)));
}
