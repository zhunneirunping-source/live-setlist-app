import { normalizeIdentityText } from "./live-planner.js";

export const WATCH_GENRES = {
  music: "ライブ・音楽", film: "映画", art: "美術展", books: "書籍", theatre: "ミュージカル・演劇",
};
export const WATCH_PRIORITIES = { important: "最重要", normal: "通常" };
export const createWatchStore = () => ({ version: 1, targets: [] });
export const watchKey = (genre, name) => `${genre}:${normalizeIdentityText(name)}`;

export function validateWatchStore(store) {
  if (!store || store.version !== 1 || !Array.isArray(store.targets) || store.targets.length > 2000) throw new TypeError("Invalid watchlist");
  const ids = new Set();
  const keys = new Set();
  for (const row of store.targets) {
    if (!row || typeof row.id !== "string" || !row.id.trim() || row.id.length > 100
      || typeof row.name !== "string" || !row.name.trim() || row.name !== row.name.trim() || row.name.length > 200
      || !Object.hasOwn(WATCH_GENRES, row.genre) || !Object.hasOwn(WATCH_PRIORITIES, row.priority)
      || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))
      || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt))
      || ids.has(row.id) || keys.has(watchKey(row.genre, row.name))) throw new TypeError("Invalid watch target or duplicate");
    ids.add(row.id); keys.add(watchKey(row.genre, row.name));
  }
  return store;
}

export function saveWatchTarget(store, draft, now = new Date().toISOString()) {
  const name = draft.name.trim();
  if (!name || name.length > 200) throw new TypeError("名前を200文字以内で入力してください。");
  if (store.targets.some(row => row.id !== draft.id && watchKey(row.genre, row.name) === watchKey(draft.genre, name))) throw new TypeError("同じジャンルに登録済みの対象です。");
  const old = store.targets.find(row => row.id === draft.id);
  if (draft.id && !old) throw new TypeError("対象が更新されています。一覧から選び直してください。");
  const target = { id: old?.id ?? `watch_${crypto.randomUUID()}`, name, genre: old?.genre ?? draft.genre, priority: draft.priority, createdAt: old?.createdAt ?? now, updatedAt: now };
  return validateWatchStore({ ...store, targets: old ? store.targets.map(row => row.id === old.id ? target : row) : [...store.targets, target] });
}

// Explicit performances are evidence of attendance; event.artists can include unseen acts.
// Archive song.artist is the existing archive's recorded performer, not a new inferred identity.
export function watchCandidates(planner, archive, watchStore) {
  const names = [
    ...planner.events.filter(event => event.status === "attended").flatMap(event => (event.performances ?? []).map(row => row.artistName)),
    ...archive.flatMap(event => (event.songs ?? []).map(song => song.artist)),
  ];
  const registered = new Set(watchStore.targets.map(row => watchKey(row.genre, row.name)));
  const candidates = new Map();
  for (const name of names) {
    if (typeof name !== "string" || !name.trim() || name === "Unknown artist") continue;
    const key = watchKey("music", name);
    if (!registered.has(key)) candidates.set(key, candidates.get(key) ?? name.trim());
  }
  return [...candidates.values()].sort((a, b) => a.localeCompare(b, "ja"));
}

export function addWatchCandidates(store, names, allowedNames, priority = "normal") {
  const allowed = new Map(allowedNames.map(name => [watchKey("music", name), name]));
  let next = store;
  for (const name of names) {
    const key = watchKey("music", name);
    if (!allowed.has(key) || next.targets.some(row => watchKey(row.genre, row.name) === key)) continue;
    next = saveWatchTarget(next, { name: allowed.get(key), genre: "music", priority });
  }
  return next;
}
