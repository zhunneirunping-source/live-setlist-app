function durationStringToSeconds(value) {
  if (!value) return 0;
  const parts = value.split(":").map(Number);
  if (parts.length === 1) return Number(parts[0] ?? 0) * 60;
  const [minutes, seconds] = parts;
  return (Number(minutes ?? 0) * 60) + Number(seconds ?? 0);
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateSetlistSeed(seed) {
  const issues = [];
  if (!isRecord(seed)) return [{ code: "MALFORMED_ROOT", path: "$" }];

  const schemaVersion = seed.schemaVersion ?? seed.version;
  if (schemaVersion != null && schemaVersion !== 1) {
    issues.push({ code: "UNSUPPORTED_SCHEMA_VERSION", path: "$.schemaVersion" });
  }

  const setlist = isRecord(seed.setlist) ? seed.setlist : seed;
  if (!isRecord(setlist) || typeof setlist.title !== "string" || !setlist.title.trim()) {
    issues.push({ code: "MISSING_SETLIST", path: "$.setlist" });
  }

  if (!Array.isArray(seed.songs)) {
    issues.push({ code: "MALFORMED_SONGS", path: "$.songs" });
    return issues;
  }

  const songIds = new Set();
  const positions = new Set();
  seed.songs.forEach((song, index) => {
    const path = `$.songs[${index}]`;
    if (!isRecord(song)) {
      issues.push({ code: "MALFORMED_SONG", path });
      return;
    }
    if (typeof song.title !== "string" || !song.title.trim()) {
      issues.push({ code: "MISSING_TITLE", path: `${path}.title` });
    }
    if (typeof song.artist !== "string" || !song.artist.trim()) {
      issues.push({ code: "MISSING_ARTIST", path: `${path}.artist` });
    }
    if (song.id != null) {
      if (!Number.isInteger(song.id) || song.id <= 0) issues.push({ code: "INVALID_SONG_ID", path: `${path}.id` });
      else if (songIds.has(song.id)) issues.push({ code: "DUPLICATE_SONG_ID", path: `${path}.id` });
      else songIds.add(song.id);
    }
    if (song.position != null) {
      if (!Number.isInteger(song.position) || song.position < 0) issues.push({ code: "INVALID_POSITION", path: `${path}.position` });
      else if (positions.has(song.position)) issues.push({ code: "DUPLICATE_POSITION", path: `${path}.position` });
      else positions.add(song.position);
    }
    if (song.setlistId != null && setlist.id != null && song.setlistId !== setlist.id) {
      issues.push({ code: "DANGLING_SETLIST_REFERENCE", path: `${path}.setlistId` });
    }
  });
  return issues;
}

export function assertValidSetlistSeed(seed) {
  const issues = validateSetlistSeed(seed);
  if (issues.length > 0) {
    throw new Error(`Invalid setlist seed: ${issues.map((issue) => `${issue.code}@${issue.path}`).join(", ")}`);
  }
}

export function normalizeSetlistSeed(seed) {
  const setlist = seed.setlist ?? {};
  const songs = Array.isArray(seed.songs) ? seed.songs : [];

  const normalizedSongs = songs.map((song, index) => {
    const resolvedDurationSeconds =
      typeof song.durationSeconds === "number"
        ? song.durationSeconds
        : durationStringToSeconds(song.duration);

    return {
      id: index + 1,
      title: song.title?.trim() || `Song ${index + 1}`,
      artist: song.artist?.trim() || "Unknown artist",
      key: song.key?.trim() || "C",
      duration: formatDuration(resolvedDurationSeconds),
      durationSeconds: resolvedDurationSeconds,
      energy: Number(song.energy ?? 3),
      position: Number(song.position ?? index + 1),
      notes: song.notes?.trim() || "",
    };
  });

  return {
    setlist: {
      title: setlist.title?.trim() || "Untitled setlist",
      venue: setlist.venue?.trim() || "TBD",
      date: setlist.date?.trim() || new Date().toISOString().slice(0, 10),
      notes: setlist.notes?.trim() || "",
    },
    songs: normalizedSongs,
  };
}
