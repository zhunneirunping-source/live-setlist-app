'use client';

import { useEffect, useMemo, useRef, useState } from "react";

type Song = {
  id: number;
  title: string;
  artist: string;
  key: string;
  duration: string;
  energy: number;
};

type SetlistMeta = {
  id: number;
  title: string;
  venue: string;
  date: string;
  notes: string;
};

const STORAGE_KEY = "live-setlist-songs";

const defaultSetlist: SetlistMeta = {
  id: 0,
  title: "",
  venue: "",
  date: "",
  notes: "",
};

const defaultSongs: Song[] = [];

function normalizeSong(song: Partial<Song> & { durationSeconds?: number | null; key?: string | null; energy?: number | null }): Song {
  const safeKey = typeof song.key === "string" && song.key.trim() ? song.key.trim() : "—";
  const safeDuration =
    typeof song.duration === "string" && song.duration.trim()
      ? song.duration
      : typeof song.durationSeconds === "number"
        ? formatDuration(song.durationSeconds)
        : "—";
  const safeEnergy = typeof song.energy === "number" ? Number(song.energy) : 0;

  return {
    id: Number(song.id ?? Date.now()),
    title: song.title ?? "Untitled song",
    artist: song.artist ?? "Unknown artist",
    key: safeKey,
    duration: safeDuration,
    energy: safeEnergy,
  };
}

const emptyDraft = {
  title: "",
  artist: "",
  key: "C",
  duration: "3:30",
};

function parseDuration(value: string) {
  const [minutes, seconds] = value.split(":");
  const minuteValue = Number(minutes ?? 0);
  const secondValue = Number(seconds ?? 0);
  return minuteValue * 60 + secondValue;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDateValue(dateString: string) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveEventTag(setlist: Pick<SetlistMeta, "title" | "notes">): "フェス" | "対バン" | "ワンマン" {
  const combined = `${setlist.title} ${setlist.notes}`.toLowerCase();

  if (/festival|フェス|rock in japan|summer sonic|countdown|viva|大作戦|daienkai|day\s*\d/.test(combined)) {
    return "フェス";
  }

  if (/support|対バン|opening act|opening|with\s+.*\b/.test(combined)) {
    return "対バン";
  }

  if (/one-man|one man|solo concert|solo|ワンマン/.test(combined)) {
    return "ワンマン";
  }

  return "ワンマン";
}

export function SetlistDashboard() {
  const [songs, setSongs] = useState<Song[]>(defaultSongs);
  const [archive, setArchive] = useState<Array<SetlistMeta & { songs: Song[] }>>([]);
  const [selectedSetlistId, setSelectedSetlistId] = useState<number>(defaultSetlist.id);
  const [activeTab, setActiveTab] = useState<"setlist" | "dashboard">("setlist");
  const [modalSetlistId, setModalSetlistId] = useState<number | null>(null);
  const [rankLimit, setRankLimit] = useState<number>(10);
  const [draft, setDraft] = useState(emptyDraft);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadArchiveData = async () => {
    const requestId = ++requestIdRef.current;

    try {
      const response = await fetch("/api/setlists?source=archive", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load setlists");
      }

      const data = await response.json();
      const setlistRows = Array.isArray(data.setlists) && data.setlists.length > 0
        ? data.setlists.map((setlist: Partial<SetlistMeta>) => ({
            id: Number(setlist.id ?? 0),
            title: setlist.title ?? "",
            venue: setlist.venue ?? "",
            date: setlist.date ?? "",
            notes: setlist.notes ?? "",
            songs: [] as Song[],
          }))
        : [];

      const details = await Promise.all(
        setlistRows.map(async (setlist) => {
          const setlistResponse = await fetch(`/api/setlists?source=archive&setlistId=${setlist.id}`, { cache: "no-store" });
          if (!setlistResponse.ok) {
            return { ...setlist, songs: [] as Song[] };
          }

          const payload = await setlistResponse.json();
          const songsForSetlist = Array.isArray(payload.songs)
            ? payload.songs.map((song: Partial<Song> & { durationSeconds?: number }) => normalizeSong(song))
            : [];

          return {
            ...setlist,
            songs: songsForSetlist,
          };
        }),
      );

      const sorted = details.sort((left, right) => {
        const leftTime = left.date ? new Date(`${left.date}T00:00:00`).getTime() : 0;
        const rightTime = right.date ? new Date(`${right.date}T00:00:00`).getTime() : 0;
        return rightTime - leftTime;
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setArchive(sorted);
      const first = sorted[0] ?? { ...defaultSetlist, songs: defaultSongs };
      setSelectedSetlistId(first.id);
      setSongs(first.songs ?? []);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setArchive([]);
      setSelectedSetlistId(defaultSetlist.id);
      setSongs(defaultSongs);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadArchiveData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  }, [songs, isLoading]);

  const selectedSetlist = archive.find((setlist) => setlist.id === selectedSetlistId) ?? archive[0] ?? { ...defaultSetlist, songs: defaultSongs };
  const modalSetlist = archive.find((setlist) => setlist.id === modalSetlistId) ?? null;

  const songRanking = useMemo(() => {
    const counts = new Map<string, { title: string; artist: string; count: number }>();
    const songIdCounts = new Map<number, number>();

    for (const setlist of archive) {
      for (const song of setlist.songs) {
        if ( Number.isFinite(song.id) && song.id > 0) {
          songIdCounts.set(song.id, (songIdCounts.get(song.id) ?? 0) + 1);
        }
      }
    }

    const hasDuplicateSongIds = [...songIdCounts.values()].some((count) => count > 1);

    for (const setlist of archive) {
      for (const song of setlist.songs) {
        const artist = song.artist.trim();
        const title = song.title.trim();
        if (!artist || !title) continue;

        const key = hasDuplicateSongIds
          ? `${artist}::${title}`.toLowerCase()
          : Number.isFinite(song.id) && song.id > 0
            ? `song:${song.id}`
            : `${artist}::${title}`.toLowerCase();

        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { title, artist, count: 1 });
        }
      }
    }

    return [...counts.values()].sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title));
  }, [archive]);

  const artistRanking = useMemo(() => {
    const counts = new Map<string, Set<number>>();

    for (const setlist of archive) {
      const seenArtists = new Set<string>();
      for (const song of setlist.songs) {
        const artist = song.artist.trim();
        if (!artist || seenArtists.has(artist)) continue;
        seenArtists.add(artist);

        const existing = counts.get(artist) ?? new Set<number>();
        existing.add(setlist.id);
        counts.set(artist, existing);
      }
    }

    return [...counts.entries()]
      .map(([artist, setlistIds]) => ({ artist, count: setlistIds.size }))
      .sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist));
  }, [archive]);

  const displayedSongRanking = useMemo(() => songRanking.slice(0, rankLimit), [songRanking, rankLimit]);
  const totalArtistObservations = useMemo(
    () => artistRanking.reduce((sum, entry) => sum + entry.count, 0),
    [artistRanking],
  );

  const chartEntries = useMemo(() => {
    const total = totalArtistObservations;
    const topEntries = artistRanking.slice(0, 6);
    const topCountTotal = topEntries.reduce((sum, entry) => sum + entry.count, 0);
    const remaining = Math.max(0, total - topCountTotal);
    const colors = ["#d9724c", "#f2b177", "#efc9a2", "#d6b38f", "#a78a6d", "#e7ddd2"];

    const entries = topEntries.map((entry, index) => ({
      ...entry,
      color: colors[index % colors.length],
      percentage: total > 0 ? (entry.count / total) * 100 : 0,
    }));

    if (remaining > 0) {
      entries.push({
        artist: "その他",
        count: remaining,
        color: colors[colors.length - 1],
        percentage: total > 0 ? (remaining / total) * 100 : 0,
      });
    }

    return entries;
  }, [artistRanking, totalArtistObservations]);

  const chartBackground = useMemo(() => {
    if (chartEntries.length === 0) return "conic-gradient(#f4efe9 0 100%)";

    let start = 0;
    const segments = chartEntries.map((entry) => {
      const end = start + entry.percentage;
      const segment = `${entry.color} ${start}% ${end}%`;
      start = end;
      return segment;
    });

    return `conic-gradient(${segments.join(", ")})`;
  }, [chartEntries]);

  const topThreeShare = useMemo(() => {
    if (totalArtistObservations === 0) return 0;
    return (artistRanking.slice(0, 3).reduce((sum, entry) => sum + entry.count, 0) / totalArtistObservations) * 100;
  }, [artistRanking, totalArtistObservations]);

  const modalArtists = useMemo(() => {
    if (!modalSetlist) return [] as Array<{ artist: string; songs: Song[] }>;

    const groups = new Map<string, Song[]>();
    for (const song of modalSetlist.songs) {
      const list = groups.get(song.artist) ?? [];
      list.push(song);
      groups.set(song.artist, list);
    }

    return [...groups.entries()]
      .map(([artist, songsByArtist]) => ({
        artist,
        songs: songsByArtist.sort((left, right) => (left.id ?? 0) - (right.id ?? 0)),
      }))
      .sort((left, right) => left.artist.localeCompare(right.artist));
  }, [modalSetlist]);

  useEffect(() => {
    if (!modalSetlistId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalSetlistId(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalSetlistId]);

  useEffect(() => {
    setSelectedArtist(null);
  }, [modalSetlistId]);

  const activeArtist =
    selectedArtist && modalArtists.some((group) => group.artist === selectedArtist)
      ? selectedArtist
      : modalArtists[0]?.artist ?? null;

  const selectedArtistSongs = useMemo(() => {
    if (!modalSetlist || !activeArtist) return [] as Song[];
    return modalSetlist.songs.filter((song) => song.artist === activeArtist);
  }, [modalSetlist, activeArtist]);

  const handleAddSong = async () => {
    const title = draft.title.trim();
    const artist = draft.artist.trim();
    const key = draft.key.trim() || "C";
    const duration = draft.duration.trim();

    if (!title || !artist || !duration) {
      return;
    }

    const payload = { setlistId: selectedSetlist.id, title, artist, key, duration, energy: 3 };

    try {
      const response = await fetch("/api/setlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to create song");
      }

      const data = await response.json();
      const nextSongs = Array.isArray(data.songs)
        ? data.songs.map((song: Partial<Song> & { durationSeconds?: number }) => normalizeSong(song))
        : defaultSongs;

      setArchive((current) => current.map((setlist) => setlist.id === selectedSetlist.id ? { ...setlist, songs: nextSongs } : setlist));
      setSongs(nextSongs);
    } catch {
      const nextSong: Song = { id: Date.now(), title, artist, key, duration, energy: 3 };
      setSongs((current) => [...current, nextSong]);
    } finally {
      setDraft(emptyDraft);
      setIsFormOpen(false);
    }
  };

  const moveSong = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= songs.length) return;

    const nextSongs = [...songs];
    [nextSongs[index], nextSongs[targetIndex]] = [nextSongs[targetIndex], nextSongs[index]];
    setSongs(nextSongs);

    try {
      const response = await fetch("/api/setlists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setlistId: selectedSetlist.id, songs: nextSongs }),
      });

      if (!response.ok) {
        throw new Error("Failed to reorder songs");
      }

      const data = await response.json();
      const persistedSongs = Array.isArray(data.songs)
        ? data.songs.map((song: Partial<Song> & { durationSeconds?: number }) => normalizeSong(song))
        : nextSongs;

      setSongs(persistedSongs);
      setArchive((current) => current.map((setlist) => setlist.id === selectedSetlist.id ? { ...setlist, songs: persistedSongs } : setlist));
    } catch {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSongs));
    }
  };

  const removeSong = async (id: number) => {
    const nextSongs = songs.filter((song) => song.id !== id);
    setSongs(nextSongs);

    try {
      const response = await fetch(`/api/setlists?id=${id}&setlistId=${selectedSetlist.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete song");
      }

      const data = await response.json();
      const persistedSongs = Array.isArray(data.songs)
        ? data.songs.map((song: Partial<Song> & { durationSeconds?: number }) => normalizeSong(song))
        : nextSongs;

      setSongs(persistedSongs);
      setArchive((current) => current.map((setlist) => setlist.id === selectedSetlist.id ? { ...setlist, songs: persistedSongs } : setlist));
    } catch {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSongs));
      }
    }
  };

  const openSetlist = (setlistId: number) => {
    const nextSetlist = archive.find((setlist) => setlist.id === setlistId) ?? archive[0] ?? defaultSetlist;
    setSelectedSetlistId(nextSetlist.id);
    setSongs(nextSetlist.songs ?? []);
    setSelectedArtist(null);
    setIsFormOpen(false);
  };

  const displayDate = (dateString: string) => formatDateValue(dateString);

  return (
    <main className="setlist-page">
      <div className="main-tab-bar" aria-label="Main view switcher">
        <button
          type="button"
          className={activeTab === "setlist" ? "tab-button active" : "tab-button"}
          onClick={() => setActiveTab("setlist")}
        >
          セトリ
        </button>
        <button
          type="button"
          className={activeTab === "dashboard" ? "tab-button active" : "tab-button"}
          onClick={() => setActiveTab("dashboard")}
        >
          ダッシュボード
        </button>
      </div>

      {activeTab === "dashboard" ? (
        <section className="dashboard-page">
          <div className="dashboard-section">
            <div className="section-header dashboard-header-row">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h2>よく聴いている曲</h2>
              </div>
              <div className="select-inline">
                {[10, 20, 50].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={rankLimit === value ? "mini-button active" : "mini-button"}
                    onClick={() => setRankLimit(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {displayedSongRanking.length === 0 ? (
              <div className="empty-state">No songs yet.</div>
            ) : (
              <ol className="song-ranking-list">
                {displayedSongRanking.map((entry, index) => (
                  <li key={`${entry.artist}-${entry.title}-${index}`} className="song-ranking-row">
                    <span className="ranking-rank">#{index + 1}</span>
                    <div className="ranking-song-meta">
                      <strong>{entry.title}</strong>
                      <small>{entry.artist}</small>
                    </div>
                    <span className="ranking-count">{entry.count}回</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="dashboard-section artist-dashboard-section">
            <div className="section-header dashboard-header-row compact-row">
              <div>
                <p className="eyebrow">Audience focus</p>
                <h3>よく観ているアーティスト</h3>
              </div>
            </div>

            <div className="artist-composition-shell">
              <div className="artist-chart-block">
                <div className="donut-chart-wrap">
                  <div
                    className="donut-chart"
                    title={chartEntries.map((entry) => `${entry.artist} ${entry.count}回 ${(entry.percentage || 0).toFixed(1)}%`).join("\n")}
                    style={{ background: chartBackground }}
                    aria-label={`Artist composition chart with ${totalArtistObservations} total views`}
                  >
                    <div className="donut-center">
                      <span className="donut-label">TOTAL</span>
                      <strong>{totalArtistObservations}回</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="artist-ranking-panel">
                <ol className="chart-label-list">
                  {artistRanking.length === 0 ? (
                    <li className="empty-state">No artist data yet.</li>
                  ) : (
                    chartEntries.map((entry, index) => {
                      const share = totalArtistObservations > 0 ? (entry.count / totalArtistObservations) * 100 : 0;

                      return (
                        <li key={`${entry.artist}-${index}`} className="chart-label-item">
                          <span className="leader-line" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                          <div className="chart-label-main">
                            <span className="chart-label-name">{entry.artist}</span>
                            <span className="chart-label-meta">{entry.count}回</span>
                          </div>
                          <span className="chart-label-percent">({share.toFixed(1)}%)</span>
                        </li>
                      );
                    })
                  )}
                </ol>

                {artistRanking.length > 0 && (
                  <div className="top-share-summary">
                    上位3組で <strong>{topThreeShare.toFixed(1)}%</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="setlist-main event-list-layout">
          <header className="topbar">
            <div>
              <p className="eyebrow">Live setlist overview</p>
              <h2>セトリ</h2>
            </div>
          </header>

          <div className="archive-list event-list">
            {archive.length === 0 ? (
              <div className="empty-state">No setlists available.</div>
            ) : (
              archive.map((setlist) => (
                <button
                  key={setlist.id}
                  type="button"
                  className={selectedSetlist.id === setlist.id ? "archive-item event-card active" : "archive-item event-card"}
                  onClick={() => {
                    openSetlist(setlist.id);
                    setModalSetlistId(setlist.id);
                  }}
                >
                  <span className="archive-date">{displayDate(setlist.date)}</span>
                  <span className="archive-tag">{resolveEventTag(setlist)}</span>
                  <strong>{setlist.title}</strong>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {modalSetlist && (
        <div className="modal-backdrop" onClick={() => setModalSetlistId(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Setlist detail</p>
                <h3>{modalSetlist.title}</h3>
              </div>
              <button type="button" className="close-button" onClick={() => setModalSetlistId(null)}>
                ×
              </button>
            </div>

            <div className="modal-meta-grid">
              <div>
                <span className="meta-label">開催日時</span>
                <strong>{displayDate(modalSetlist.date)}</strong>
              </div>
              <div>
                <span className="meta-label">場所</span>
                <strong>{modalSetlist.venue || "—"}</strong>
              </div>
              <div>
                <span className="meta-label">メモ</span>
                <strong>{modalSetlist.notes || "—"}</strong>
              </div>
            </div>

            <div className="stats-row modal-stats-row" aria-label="Setlist stats">
              <div className="stat-card">
                <span>Songs</span>
                <strong>{modalSetlist.songs.length}</strong>
              </div>
              <div className="stat-card">
                <span>Runtime</span>
                <strong>{formatDuration(modalSetlist.songs.reduce((sum, song) => sum + parseDuration(song.duration), 0))}</strong>
              </div>
              <div className="stat-card">
                <span>Energy</span>
                <strong>{modalSetlist.songs.length === 0 ? "Low" : (modalSetlist.songs.reduce((sum, song) => sum + song.energy, 0) / modalSetlist.songs.length >= 4 ? "High" : modalSetlist.songs.reduce((sum, song) => sum + song.energy, 0) / modalSetlist.songs.length >= 3 ? "Medium" : "Low")}</strong>
              </div>
            </div>

            <div className="modal-detail-section">
              <h4>出演アーティスト</h4>
              <div className="artist-select-list">
                {modalArtists.map((group, index) => (
                  <button
                    key={group.artist}
                    type="button"
                    className={activeArtist === group.artist ? "artist-chip active" : "artist-chip"}
                    onClick={() => setSelectedArtist(group.artist)}
                  >
                    {String(index + 1).padStart(2, "0")} {group.artist}
                  </button>
                ))}
              </div>

              {activeArtist && (
                <div className="artist-detail-panel">
                  <h5>{activeArtist}</h5>
                  <ol className="artist-song-list">
                    {selectedArtistSongs.map((song, index) => (
                      <li key={`${activeArtist}-${song.id}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{song.title}</strong>
                        <small>{song.duration}</small>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="modal-detail-section setlist-editor-block">
              <div className="section-header compact-header">
                <h4>セットリスト編集</h4>
                <button className="primary-button small-button" type="button" onClick={() => setIsFormOpen((current) => !current)}>
                  {isFormOpen ? "閉じる" : "曲を追加"}
                </button>
              </div>

              {isFormOpen && (
                <form
                  className="song-form modal-song-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAddSong();
                  }}
                >
                  <label>
                    Title
                    <input
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Song title"
                    />
                  </label>
                  <label>
                    Artist
                    <input
                      value={draft.artist}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, artist: event.target.value }))
                      }
                      placeholder="Artist name"
                    />
                  </label>
                  <label>
                    Key
                    <input
                      value={draft.key}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, key: event.target.value }))
                      }
                      placeholder="A"
                    />
                  </label>
                  <label>
                    Duration
                    <input
                      value={draft.duration}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, duration: event.target.value }))
                      }
                      placeholder="3:30"
                    />
                  </label>
                  <button type="submit" className="submit-button">
                    Save song
                  </button>
                </form>
              )}

              <div className="setlist-panel modal-song-panel">
                <div className="panel-header">
                  <h3>Set order</h3>
                  <span>{songs.length} tracks</span>
                </div>

                {songs.length === 0 ? (
                  <div className="empty-state">No songs yet. Add the first track.</div>
                ) : (
                  <ol className="song-list">
                    {songs.map((song, index) => (
                      <li className="song-item" key={song.id}>
                        <div className="song-index">{String(index + 1).padStart(2, "0")}</div>

                        <div className="song-copy">
                          <div className="song-title-row">
                            <strong>{song.title}</strong>
                            <span>{song.duration}</span>
                          </div>
                          <p>{song.artist}</p>
                        </div>

                        <div className="song-actions">
                          <div className="song-tag">{song.key}</div>
                          <div className="inline-actions">
                            <button
                              type="button"
                              onClick={() => moveSong(index, -1)}
                              aria-label={`Move ${song.title} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSong(index, 1)}
                              aria-label={`Move ${song.title} down`}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => removeSong(song.id)}
                              aria-label={`Remove ${song.title}`}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
