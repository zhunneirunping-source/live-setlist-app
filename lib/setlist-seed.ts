export type SetlistSeedSong = {
  title: string;
  artist?: string | null;
  key?: string | null;
  duration?: string | null;
  durationSeconds?: number | null;
  energy?: number | null;
  position?: number | null;
  notes?: string | null;
};

export type SetlistSeed = {
  setlist?: {
    title?: string;
    venue?: string;
    date?: string;
    eventType?: "festival" | "one_man" | "taiban";
    notes?: string;
  };
  songs?: SetlistSeedSong[];
};

export type NormalizedSetlistSong = {
  id: number;
  title: string;
  artist: string;
  key: string | null;
  duration: string | null;
  durationSeconds: number | null;
  energy: number | null;
  position: number;
  notes: string;
};

export type NormalizedSetlistSeed = {
  setlist: {
    title: string;
    venue: string;
    date: string;
    eventType: "festival" | "one_man" | "taiban" | null;
    notes: string;
  };
  songs: NormalizedSetlistSong[];
};

function durationStringToSeconds(value?: string | null) {
  if (!value) return 0;
  const parts = value.split(":").map(Number);
  if (parts.length === 1) return Number(parts[0] ?? 0) * 60;
  const [minutes, seconds] = parts;
  return (Number(minutes ?? 0) * 60) + Number(seconds ?? 0);
}

function formatDuration(totalSeconds: number | null | undefined) {
  if (typeof totalSeconds !== "number" || Number.isNaN(totalSeconds)) return null;
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export type SetlistSeedIssue = { code: string; path: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateSetlistSeed(seed: unknown): SetlistSeedIssue[] {
  const issues: SetlistSeedIssue[] = [];
  if (!isRecord(seed)) return [{ code: "MALFORMED_ROOT", path: "$" }];
  const schemaVersion = seed.schemaVersion ?? seed.version;
  if (schemaVersion != null && schemaVersion !== 1) issues.push({ code: "UNSUPPORTED_SCHEMA_VERSION", path: "$.schemaVersion" });
  const setlist = isRecord(seed.setlist) ? seed.setlist : seed;
  if (typeof setlist.title !== "string" || !setlist.title.trim()) issues.push({ code: "MISSING_SETLIST", path: "$.setlist" });
  if (setlist.eventType != null && !["festival", "one_man", "taiban"].includes(String(setlist.eventType))) issues.push({ code: "INVALID_EVENT_TYPE", path: "$.setlist.eventType" });
  if (!Array.isArray(seed.songs)) {
    issues.push({ code: "MALFORMED_SONGS", path: "$.songs" });
    return issues;
  }
  const songIds = new Set<number>();
  const positions = new Set<number>();
  seed.songs.forEach((song, index) => {
    const path = `$.songs[${index}]`;
    if (!isRecord(song)) {
      issues.push({ code: "MALFORMED_SONG", path });
      return;
    }
    if (typeof song.title !== "string" || !song.title.trim()) issues.push({ code: "MISSING_TITLE", path: `${path}.title` });
    if (typeof song.artist !== "string" || !song.artist.trim()) issues.push({ code: "MISSING_ARTIST", path: `${path}.artist` });
    if (song.id != null) {
      if (!Number.isInteger(song.id) || Number(song.id) <= 0) issues.push({ code: "INVALID_SONG_ID", path: `${path}.id` });
      else if (songIds.has(Number(song.id))) issues.push({ code: "DUPLICATE_SONG_ID", path: `${path}.id` });
      else songIds.add(Number(song.id));
    }
    if (song.position != null) {
      if (!Number.isInteger(song.position) || Number(song.position) < 0) issues.push({ code: "INVALID_POSITION", path: `${path}.position` });
      else if (positions.has(Number(song.position))) issues.push({ code: "DUPLICATE_POSITION", path: `${path}.position` });
      else positions.add(Number(song.position));
    }
    if (song.setlistId != null && setlist.id != null && song.setlistId !== setlist.id) issues.push({ code: "DANGLING_SETLIST_REFERENCE", path: `${path}.setlistId` });
  });
  return issues;
}

export function assertValidSetlistSeed(seed: unknown): asserts seed is SetlistSeed {
  const issues = validateSetlistSeed(seed);
  if (issues.length > 0) throw new Error(`Invalid setlist seed: ${issues.map((issue) => `${issue.code}@${issue.path}`).join(", ")}`);
}

export function normalizeSetlistSeed(seed: SetlistSeed): NormalizedSetlistSeed {
  const setlist = seed.setlist ?? {};
  const songs = Array.isArray(seed.songs) ? seed.songs : [];

  const normalizedSongs = songs.map((song, index) => {
    const rawDurationSeconds =
      typeof song.durationSeconds === "number"
        ? song.durationSeconds
        : typeof song.duration === "string"
          ? durationStringToSeconds(song.duration)
          : null;

    const normalizedKey = typeof song.key === "string" ? song.key.trim() || null : null;
    const normalizedEnergy = typeof song.energy === "number" ? Number(song.energy) : null;

    return {
      id: index + 1,
      title: song.title?.trim() || `Song ${index + 1}`,
      artist: song.artist?.trim() || "Unknown artist",
      key: normalizedKey,
      duration: formatDuration(rawDurationSeconds),
      durationSeconds: rawDurationSeconds,
      energy: normalizedEnergy,
      position: Number(song.position ?? index + 1),
      notes: song.notes?.trim() || "",
    };
  });

  return {
    setlist: {
      title: setlist.title?.trim() || "Untitled setlist",
      venue: setlist.venue?.trim() || "TBD",
      date: setlist.date?.trim() || new Date().toISOString().slice(0, 10),
      eventType: ["festival", "one_man", "taiban"].includes(String(setlist.eventType)) ? setlist.eventType ?? null : null,
      notes: setlist.notes?.trim() || "",
    },
    songs: normalizedSongs,
  };
}
