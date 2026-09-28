import { validateSetlistSeed } from "../../../lib/setlist-seed.js";
import { rejectSetlistWrite } from "../../../lib/read-only-api.js";

const archiveModules = import.meta.glob("../../../初期移行データ/*.json", {
  eager: true,
  import: "default",
}) as Record<string, {
  setlist?: { title?: string; venue?: string; date?: string; eventType?: "festival" | "one_man" | "taiban"; notes?: string };
  title?: string;
  venue?: string;
  date?: string;
  eventType?: "festival" | "one_man" | "taiban";
  notes?: string;
  songs?: Array<{
    title?: string;
    artist?: string;
    key?: string | null;
    duration?: string | number | null;
    durationSeconds?: number | null;
    energy?: number | null;
    position?: number | null;
    notes?: string | null;
  }>;
}>;

function toSecondsFromDuration(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const match = /^(?:(\d+):)?(\d{1,2})(?::(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const [, hoursPart, minutesPart, secondsPart] = match;
  return Number(hoursPart ?? 0) * 3600 + Number(minutesPart ?? 0) * 60 + Number(secondsPart ?? 0);
}

function getArchiveData(selectedSetlistId?: number | null) {
  const entries = Object.values(archiveModules)
    .filter(Boolean)
    .map((archive) => {
      const issues = validateSetlistSeed(archive);
      if (issues.length > 0) {
        console.error(JSON.stringify({ event: "invalid_setlist_archive", issueCodes: issues.map((issue) => issue.code) }));
        return null;
      }

      const setlist = archive.setlist ?? archive;
      return {
        setlist: {
          id: 0,
          title: String(setlist.title ?? "Untitled setlist"),
          venue: String(setlist.venue ?? "TBD"),
          date: String(setlist.date ?? ""),
          eventType: ["festival", "one_man", "taiban"].includes(String(setlist.eventType)) ? setlist.eventType ?? null : null,
          notes: String(setlist.notes ?? ""),
        },
        songs: (archive.songs ?? []).map((song, index) => ({
          id: index + 1,
          title: String(song.title ?? "Untitled song"),
          artist: String(song.artist ?? "Unknown artist"),
          key: typeof song.key === "string" && song.key.trim() ? song.key.trim() : null,
          durationSeconds: toSecondsFromDuration(song.durationSeconds ?? song.duration ?? null),
          energy: typeof song.energy === "number" ? song.energy : null,
          position: typeof song.position === "number" ? song.position : index,
          notes: String(song.notes ?? ""),
        })),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => (right.setlist.date || "").localeCompare(left.setlist.date || ""));

  const setlists = entries.map((entry, index) => ({ ...entry.setlist, id: index + 1 }));
  const requestedId = Number(selectedSetlistId ?? setlists[0]?.id ?? 0);
  const foundIndex = setlists.findIndex((setlist) => setlist.id === requestedId);
  const selectedIndex = foundIndex >= 0 ? foundIndex : 0;
  const setlist = setlists[selectedIndex] ?? null;

  return {
    setlists,
    setlist,
    songs: setlist ? entries[selectedIndex]?.songs ?? [] : [],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const archive = getArchiveData(Number(searchParams.get("setlistId") ?? id ?? 0));

    if (id && !searchParams.has("setlistId")) {
      return Response.json({ song: archive.songs.find((song) => song.id === Number(id)) ?? null });
    }

    return Response.json(archive);
  } catch {
    return Response.json({ error: "Setlist archive is unavailable" }, { status: 500 });
  }
}

export async function POST() {
  return rejectSetlistWrite();
}

export async function PUT() {
  return rejectSetlistWrite();
}

export async function DELETE() {
  return rejectSetlistWrite();
}
