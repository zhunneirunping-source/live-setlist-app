import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { setlistSongs, setlists, songs } from "../../../db/schema";

const archiveModules = import.meta.glob("../../../初期移行データ/*.json", {
  eager: true,
  import: "default",
}) as Record<string, {
  setlist?: { title?: string; venue?: string; date?: string; notes?: string };
  title?: string;
  venue?: string;
  date?: string;
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

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  return `${message}\n${detail}`;
}

function toSecondsFromDuration(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const match = /^(?:(\d+):)?(\d{1,2})(?::(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, hoursPart, minutesPart, secondsPart] = match;
  const hours = Number(hoursPart ?? 0);
  const minutes = Number(minutesPart ?? 0);
  const seconds = Number(secondsPart ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function getArchiveFallbackData(selectedSetlistId?: number | null) {
  const entries = Object.values(archiveModules)
    .filter(Boolean)
    .map((archive) => {
      const setlist = archive.setlist ?? archive;
      const songsSource = Array.isArray(archive.songs) ? archive.songs : [];

      const normalizedSetlist = {
        id: 0,
        title: String(setlist.title ?? "Untitled setlist"),
        venue: String(setlist.venue ?? "TBD"),
        date: String(setlist.date ?? ""),
        notes: String(setlist.notes ?? ""),
      };

      const normalizedSongs = songsSource.map((song, index) => ({
        id: index + 1,
        title: String(song.title ?? "Untitled song"),
        artist: String(song.artist ?? "Unknown artist"),
        key: typeof song.key === "string" && song.key.trim() ? song.key.trim() : null,
        durationSeconds: toSecondsFromDuration(song.durationSeconds ?? song.duration ?? null),
        energy: typeof song.energy === "number" ? song.energy : null,
        position: typeof song.position === "number" ? song.position : index,
        notes: String(song.notes ?? ""),
      }));

      return {
        setlist: normalizedSetlist,
        songs: normalizedSongs,
      };
    })
    .sort((left, right) => {
      const leftDate = left.setlist.date || "";
      const rightDate = right.setlist.date || "";
      return rightDate.localeCompare(leftDate);
    });

  const mappedSetlists = entries.map((entry, index) => ({
    id: index + 1,
    title: entry.setlist.title,
    venue: entry.setlist.venue,
    date: entry.setlist.date,
    notes: entry.setlist.notes,
  }));

  const effectiveSelectedId = Number(selectedSetlistId ?? mappedSetlists[0]?.id ?? 0);
  const selectedIndex = effectiveSelectedId > 0
    ? mappedSetlists.findIndex((setlist) => setlist.id === effectiveSelectedId)
    : 0;

  const selectedSetlist = mappedSetlists[selectedIndex] ?? mappedSetlists[0] ?? null;
  const selectedSongs = selectedSetlist
    ? entries[selectedIndex]?.songs ?? []
    : [];

  return {
    setlists: mappedSetlists,
    setlist: selectedSetlist,
    songs: selectedSongs.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      key: song.key,
      durationSeconds: song.durationSeconds,
      energy: song.energy,
      position: song.position,
      notes: song.notes,
    })),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const forceArchive = searchParams.get("source") === "archive";
    const archiveAvailable = Object.keys(archiveModules).length > 0;

    if (forceArchive || archiveAvailable) {
      const fallback = getArchiveFallbackData(Number(searchParams.get("setlistId") ?? searchParams.get("id") ?? 0));
      if (id) {
        const selectedSong = fallback.songs.find((song) => song.id === Number(id)) ?? null;
        return Response.json({ song: selectedSong });
      }
      return Response.json(fallback);
    }

    try {
      const db = await getDb();

      if (id) {
        const rows = await db
          .select()
          .from(songs)
          .where(eq(songs.id, Number(id)))
          .limit(1);

        return Response.json({ song: rows[0] ?? null });
      }

      const setlistRows = await db
        .select()
        .from(setlists)
        .orderBy(desc(setlists.date), desc(setlists.id));

      const selectedSetlistId = Number(searchParams.get("setlistId") ?? searchParams.get("id") ?? setlistRows[0]?.id ?? 0);
      const selectedSetlist =
        setlistRows.find((setlist) => setlist.id === selectedSetlistId) ?? setlistRows[0] ?? null;

      const rows = selectedSetlist
        ? await db
            .select({
              id: songs.id,
              title: songs.title,
              artist: songs.artist,
              key: songs.key,
              durationSeconds: songs.durationSeconds,
              energy: songs.energy,
              position: songs.position,
              notes: songs.notes,
            })
            .from(setlistSongs)
            .innerJoin(songs, eq(setlistSongs.songId, songs.id))
            .where(eq(setlistSongs.setlistId, selectedSetlist.id))
            .orderBy(sql`${setlistSongs.position} ASC`, desc(songs.id))
        : [];

      return Response.json({ setlists: setlistRows, setlist: selectedSetlist, songs: rows });
    } catch (dbError) {
      const fallback = getArchiveFallbackData(Number(searchParams.get("setlistId") ?? searchParams.get("id") ?? 0));
      return Response.json({
        ...fallback,
        error: toRouteErrorMessage(dbError),
      });
    }
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      setlistId?: number;
      title?: string;
      artist?: string;
      key?: string;
      duration?: string;
      energy?: number;
    };

    const title = payload.title?.trim() ?? "";
    const artist = payload.artist?.trim() ?? "Unknown artist";
    const key = payload.key?.trim() || "C";
    const duration = payload.duration?.trim() || "3:30";
    const energy = Number(payload.energy ?? 3);
    const setlistId = Number(payload.setlistId ?? 0);

    if (!title) {
      return Response.json({ error: "title is required" }, { status: 400 });
    }

    const db = await getDb();
    const setlistRows = await db.select().from(setlists).orderBy(desc(setlists.date), desc(setlists.id));
    const targetSetlist = setlistRows.find((row) => row.id === setlistId) ?? setlistRows[0];

    if (!targetSetlist) {
      return Response.json({ error: "setlist not found" }, { status: 404 });
    }

    const existingSongs = await db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        key: songs.key,
        durationSeconds: songs.durationSeconds,
        energy: songs.energy,
        position: songs.position,
        notes: songs.notes,
      })
      .from(setlistSongs)
      .innerJoin(songs, eq(setlistSongs.songId, songs.id))
      .where(eq(setlistSongs.setlistId, targetSetlist.id))
      .orderBy(sql`${setlistSongs.position} ASC`, desc(songs.id));

    const [song] = await db.insert(songs).values({
      title,
      artist,
      key,
      durationSeconds: durationToSeconds(duration),
      energy,
      position: existingSongs.length,
    }).returning();

    await db.insert(setlistSongs).values({
      setlistId: targetSetlist.id,
      songId: song.id,
      position: existingSongs.length,
      cue: "",
    });

    const rows = await db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        key: songs.key,
        durationSeconds: songs.durationSeconds,
        energy: songs.energy,
        position: songs.position,
        notes: songs.notes,
      })
      .from(setlistSongs)
      .innerJoin(songs, eq(setlistSongs.songId, songs.id))
      .where(eq(setlistSongs.setlistId, targetSetlist.id))
      .orderBy(sql`${setlistSongs.position} ASC`, desc(songs.id));

    return Response.json({ setlist: targetSetlist, song, songs: rows }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as {
      setlistId?: number;
      songs?: Array<{
        id: number;
        title: string;
        artist: string;
        key: string;
        duration: string;
        energy: number;
      }>;
    };

    const db = await getDb();
    const nextSongs = payload.songs ?? [];
    const setlistId = Number(payload.setlistId ?? 0);

    if (!setlistId) {
      return Response.json({ error: "setlistId is required" }, { status: 400 });
    }

    await Promise.all(
      nextSongs.map((song, index) =>
        db.update(songs)
          .set({
            title: song.title,
            artist: song.artist,
            key: song.key,
            durationSeconds: durationToSeconds(song.duration),
            energy: Number(song.energy ?? 3),
            position: index,
          })
          .where(eq(songs.id, song.id)),
      ),
    );

    await Promise.all(
      nextSongs.map((song, index) =>
        db.update(setlistSongs)
          .set({ position: index, cue: "" })
          .where(and(eq(setlistSongs.setlistId, setlistId), eq(setlistSongs.songId, song.id))),
      ),
    );

    const rows = await db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        key: songs.key,
        durationSeconds: songs.durationSeconds,
        energy: songs.energy,
        position: songs.position,
        notes: songs.notes,
      })
      .from(setlistSongs)
      .innerJoin(songs, eq(setlistSongs.songId, songs.id))
      .where(eq(setlistSongs.setlistId, setlistId))
      .orderBy(sql`${setlistSongs.position} ASC`, desc(songs.id));

    return Response.json({ setlistId, songs: rows });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const setlistId = Number(searchParams.get("setlistId") ?? 0);

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const db = await getDb();
    if (setlistId) {
      await db.delete(setlistSongs).where(and(eq(setlistSongs.setlistId, setlistId), eq(setlistSongs.songId, Number(id))));
    }
    await db.delete(songs).where(eq(songs.id, Number(id)));

    const rows = await db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        key: songs.key,
        durationSeconds: songs.durationSeconds,
        energy: songs.energy,
        position: songs.position,
        notes: songs.notes,
      })
      .from(setlistSongs)
      .innerJoin(songs, eq(setlistSongs.songId, songs.id))
      .where(eq(setlistSongs.setlistId, setlistId))
      .orderBy(sql`${setlistSongs.position} ASC`, desc(songs.id));

    return Response.json({ setlistId, songs: rows });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 },
    );
  }
}

function durationToSeconds(duration: string) {
  const [minutes, seconds] = duration.split(":");
  return (Number(minutes ?? 0) * 60) + Number(seconds ?? 0);
}
