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
