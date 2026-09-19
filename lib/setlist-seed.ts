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
      notes: setlist.notes?.trim() || "",
    },
    songs: normalizedSongs,
  };
}
