export const SONG_CACHE_VERSION = 1;

function normalizeCachedSong(value) {
  if (!value || typeof value !== "object") return null;

  const id = Number(value.id);
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const artist = typeof value.artist === "string" ? value.artist.trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !title || !artist) return null;

  return {
    id,
    title,
    artist,
    key: typeof value.key === "string" && value.key.trim() ? value.key.trim() : "—",
    duration: typeof value.duration === "string" && value.duration.trim() ? value.duration.trim() : "—",
    energy: Number.isFinite(Number(value.energy)) ? Number(value.energy) : 0,
  };
}

export function readSongCache(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const isLegacy = Array.isArray(parsed);
  const songsSource = isLegacy ? parsed : parsed?.version === SONG_CACHE_VERSION && Array.isArray(parsed.songs) ? parsed.songs : null;
  if (!songsSource) return null;

  const songs = songsSource.map(normalizeCachedSong).filter(Boolean);
  const setlistId = isLegacy ? 0 : Number(parsed.setlistId ?? 0);
  return {
    version: SONG_CACHE_VERSION,
    setlistId: Number.isFinite(setlistId) && setlistId > 0 ? setlistId : 0,
    songs,
    migratedFromLegacy: isLegacy,
  };
}

export function readSongCacheFromStorage(storage, key) {
  try {
    return readSongCache(storage.getItem(key));
  } catch {
    return null;
  }
}

export function writeSongCache(storage, key, setlistId, songs) {
  try {
    storage.setItem(key, JSON.stringify({ version: SONG_CACHE_VERSION, setlistId, songs }));
    return true;
  } catch {
    return false;
  }
}
