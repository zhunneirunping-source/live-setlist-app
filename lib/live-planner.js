export const PLANNER_STORAGE_KEY = "live-setlist-planner:v1";
export const PLANNER_SCHEMA_VERSION = 2;

export const EVENT_STATUSES = [
  "interested",
  "applied",
  "waiting_result",
  "confirmed",
  "lost",
  "cancelled",
  "attended",
];

export const EVENT_TYPES = ["festival", "one_man", "taiban"];
export const EVENT_TYPE_LABELS = {
  festival: "フェス",
  one_man: "単独",
  taiban: "対バン",
};

export const SETLIST_SECTIONS = ["rehearsal", "main", "encore"];
export const SETLIST_SECTION_LABELS = {
  rehearsal: "リハ",
  main: "本番",
  encore: "en",
};

export const PLAYLIST_STATUSES = ["unreviewed", "candidate", "already_added", "added", "unavailable", "dismissed"];

export const EVENT_STATUS_LABELS = {
  interested: "気になる",
  applied: "申込予定",
  waiting_result: "抽選中",
  confirmed: "当選・参戦予定",
  lost: "落選",
  cancelled: "キャンセル",
  attended: "参戦済み",
};

export const PLAYLIST_STATUS_LABELS = {
  unreviewed: "要確認",
  candidate: "追加候補",
  already_added: "登録済み",
  added: "今回追加",
  dismissed: "追加しない",
  unavailable: "登録不可",
};

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createPlannerStore(today = localDateString()) {
  return {
    version: PLANNER_SCHEMA_VERSION,
    trackingEnabledAt: today,
    events: [],
    songs: [],
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function loadPlannerStore(raw, today = localDateString()) {
  if (!raw) return { store: createPlannerStore(today), recovered: false };

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || ![1, PLANNER_SCHEMA_VERSION].includes(parsed.version)) throw new TypeError("Unsupported planner version");
    validatePlannerStore(parsed);

    return {
      store: {
        ...parsed,
        version: PLANNER_SCHEMA_VERSION,
        trackingEnabledAt: typeof parsed.trackingEnabledAt === "string" ? parsed.trackingEnabledAt : today,
        events: parsed.events,
        songs: parsed.songs,
      },
      recovered: false,
    };
  } catch {
    return { store: null, recovered: true };
  }
}

export function isPlannerStoreEmpty(store) {
  return (store?.events?.length ?? 0) === 0 && (store?.songs?.length ?? 0) === 0;
}

export function plannerMigrationKey(store) {
  const eventIds = (store?.events ?? []).map((event) => event.id).sort().join(",");
  const songIds = (store?.songs ?? []).map((song) => song.id).sort().join(",");
  return `planner-v${store?.version ?? 0}:${stableHash(`${store?.trackingEnabledAt ?? ""}|${eventIds}|${songIds}`)}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function recordsEqual(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function buildPlannerMigrationReview(localStore, cloudStore) {
  const cloudEvents = new Map((cloudStore?.events ?? []).map((event) => [event.id, event]));
  const cloudSongsById = new Map((cloudStore?.songs ?? []).map((song) => [song.id, song]));
  const cloudSongsByKey = new Map((cloudStore?.songs ?? []).map((song) => [song.canonicalKey, song]));
  const safeSongs = [];
  const songConflicts = [];

  for (const song of localStore?.songs ?? []) {
    const cloudSong = cloudSongsById.get(song.id) ?? cloudSongsByKey.get(song.canonicalKey);
    if (!cloudSong) safeSongs.push(song);
    else if (!recordsEqual(song, cloudSong)) songConflicts.push({ local: song, cloud: cloudSong });
  }

  const conflictingSongIds = new Set(songConflicts.flatMap(({ local, cloud }) => [local.id, cloud.id]));
  const availableSongIds = new Set([...(cloudStore?.songs ?? []).map((song) => song.id), ...safeSongs.map((song) => song.id)]);
  const safeEvents = [];
  const eventConflicts = [];
  for (const event of localStore?.events ?? []) {
    const cloudEvent = cloudEvents.get(event.id);
    if (cloudEvent) {
      if (!recordsEqual(event, cloudEvent)) eventConflicts.push({ local: event, cloud: cloudEvent, reason: "same_id_changed" });
      continue;
    }
    const referencedSongIds = (event.performances ?? []).flatMap((performance) => (performance.tracks ?? []).map((track) => track.songId));
    if (referencedSongIds.some((songId) => conflictingSongIds.has(songId) || !availableSongIds.has(songId))) {
      eventConflicts.push({ local: event, cloud: null, reason: "song_conflict_or_missing" });
    } else {
      safeEvents.push(event);
    }
  }

  return {
    migrationKey: plannerMigrationKey(localStore),
    safeEvents,
    safeSongs,
    eventConflicts,
    songConflicts,
    hasCandidates: safeEvents.length > 0 || safeSongs.length > 0,
    hasConflicts: eventConflicts.length > 0 || songConflicts.length > 0,
  };
}

export function mergePlannerMigrationCandidates(cloudStore, localStore) {
  const review = buildPlannerMigrationReview(localStore, cloudStore);
  return {
    review,
    store: {
      ...cloudStore,
      events: [...cloudStore.events, ...review.safeEvents],
      songs: [...cloudStore.songs, ...review.safeSongs],
    },
  };
}

export function plannerStorePreserves(baseStore, candidateStore) {
  const candidateEvents = new Map((candidateStore?.events ?? []).map((event) => [event.id, event]));
  const candidateSongs = new Map((candidateStore?.songs ?? []).map((song) => [song.id, song]));
  return baseStore?.version === candidateStore?.version
    && baseStore?.trackingEnabledAt === candidateStore?.trackingEnabledAt
    && (baseStore?.events ?? []).every((event) => recordsEqual(event, candidateEvents.get(event.id)))
    && (baseStore?.songs ?? []).every((song) => recordsEqual(song, candidateSongs.get(song.id)));
}

export function plannerStoreCovers(sourceStore, candidateStore) {
  const candidateEvents = new Map((candidateStore?.events ?? []).map((event) => [event.id, event]));
  const candidateSongs = new Map((candidateStore?.songs ?? []).map((song) => [song.id, song]));
  return (sourceStore?.events ?? []).every((event) => recordsEqual(event, candidateEvents.get(event.id)))
    && (sourceStore?.songs ?? []).every((song) => recordsEqual(song, candidateSongs.get(song.id)));
}

function isValidEvent(event) {
  return isRecord(event)
    && typeof event.id === "string"
    && typeof event.title === "string"
    && typeof event.date === "string"
    && EVENT_STATUSES.includes(event.status);
}

function isValidCatalogSong(song) {
  return isRecord(song)
    && typeof song.id === "string"
    && typeof song.displayTitle === "string"
    && typeof song.displayArtist === "string"
    && PLAYLIST_STATUSES.includes(song.playlistStatus);
}

export function validatePlannerStore(store) {
  if (!isRecord(store) || ![1, 2].includes(store.version) || !Array.isArray(store.events) || !Array.isArray(store.songs)) throw new TypeError("Invalid planner");
  const ids = new Set();
  for (const song of store.songs) {
    if (!isValidCatalogSong(song) || !song.id || !song.displayTitle.trim() || !song.displayArtist.trim() || ids.has(song.id)) throw new TypeError("Invalid song");
    ids.add(song.id);
    if (song.canonicalKey !== songCanonicalKey(song.displayArtist, song.displayTitle)) throw new TypeError("Invalid canonical key");
    if (song.aliases !== undefined && (!Array.isArray(song.aliases) || song.aliases.some((alias) => typeof alias !== "string" || !alias.trim()))) throw new TypeError("Invalid aliases");
    if (song.playlistStatus === "unavailable" && !song.playlistReason?.trim()) throw new TypeError("Unavailable reason required");
    if (song.playlistReason !== undefined && typeof song.playlistReason !== "string") throw new TypeError("Invalid reason");
  }
  const eventIds = new Set();
  for (const event of store.events) {
    if (!isValidEvent(event) || eventIds.has(event.id) || !Array.isArray(event.performances ?? [])) throw new TypeError("Invalid event");
    eventIds.add(event.id);
    for (const performance of event.performances ?? []) {
      if (!isRecord(performance) || !Array.isArray(performance.tracks)) throw new TypeError("Invalid performance");
      for (const track of performance.tracks) {
        if (!isRecord(track) || !ids.has(track.songId) || !Number.isInteger(track.position) || track.position < 1) throw new TypeError("Invalid track reference");
        if (track.section !== undefined && !SETLIST_SECTIONS.includes(track.section)) throw new TypeError("Invalid section");
        if (track.performedTitle !== undefined && typeof track.performedTitle !== "string") throw new TypeError("Invalid performance title");
        if (track.performanceNote !== undefined && typeof track.performanceNote !== "string") throw new TypeError("Invalid performance note");
      }
    }
  }
  for (const song of store.songs) {
    if (song.mergedIntoSongId) {
      const target = store.songs.find((row) => row.id === song.mergedIntoSongId);
      if (!target || target.mergedIntoSongId || target.id === song.id || normalizeIdentityText(target.displayArtist) !== normalizeIdentityText(song.displayArtist)) throw new TypeError("Invalid merge target");
    }
  }
  return store;
}

export function findCatalogSong(songs, artist, title) {
  const key = songCanonicalKey(artist, title);
  const matches = songs.filter((song) => !song.mergedIntoSongId && [song.displayTitle, ...(song.aliases ?? [])].some((name) => songCanonicalKey(song.displayArtist, name) === key));
  if (matches.length > 1) throw new TypeError("同じ曲の候補が複数あります。管理画面で統合するか、既存曲を選択してください。");
  return matches[0];
}

export function playlistSongs(store, status = "candidate") {
  const groups = new Map();
  for (const song of store.songs.filter((row) => !row.mergedIntoSongId)) {
    const group = groups.get(song.canonicalKey) ?? [];
    group.push(song);
    groups.set(song.canonicalKey, group);
  }
  if (status === "all") return store.songs.filter((song) => !song.mergedIntoSongId);
  return [...groups.values()].flatMap((group) => {
    if (status === "candidate" && group.some((song) => ["already_added", "added", "unavailable", "dismissed"].includes(song.playlistStatus))) return [];
    return group.filter((song) => song.playlistStatus === status).slice(0, 1);
  });
}

export function renameCatalogSong(store, songId, title, now = new Date().toISOString()) {
  const song = store.songs.find((row) => row.id === songId && !row.mergedIntoSongId);
  if (!song || !title.trim()) throw new TypeError("曲名を入力してください。");
  const conflict = findCatalogSong(store.songs.filter((row) => row.id !== songId), song.displayArtist, title);
  if (conflict) throw new TypeError("既存曲と一致します。曲名修正ではなく統合してください。");
  return { ...store, songs: store.songs.map((row) => row.id === songId ? { ...row, displayTitle: title.trim(), canonicalKey: songCanonicalKey(row.displayArtist, title), aliases: [...new Set([...(row.aliases ?? []), row.displayTitle])], updatedAt: now } : row), events: store.events.map((event) => ({ ...event, performances: (event.performances ?? []).map((performance) => ({ ...performance, tracks: performance.tracks.map((track) => track.songId === songId ? { ...track, performedTitle: track.performedTitle ?? song.displayTitle } : track) })) })) };
}

export function mergeCatalogSongs(store, sourceId, targetId, now = new Date().toISOString()) {
  const source = store.songs.find((song) => song.id === sourceId);
  const target = store.songs.find((song) => song.id === targetId);
  if (!source || !target || sourceId === targetId || source.mergedIntoSongId || target.mergedIntoSongId || normalizeIdentityText(source.displayArtist) !== normalizeIdentityText(target.displayArtist)) throw new TypeError("同じアーティストの未統合曲を選択してください。");
  // The explicitly chosen target's status/reason wins; never infer playlist membership.
  const next = { ...store, songs: store.songs.map((song) => song.id === sourceId ? { ...song, mergedIntoSongId: targetId, updatedAt: now } : song.id === targetId ? { ...song, aliases: [...new Set([...(target.aliases ?? []), source.displayTitle, ...(source.aliases ?? [])])], updatedAt: now } : song.mergedIntoSongId === sourceId ? { ...song, mergedIntoSongId: targetId } : song), events: store.events.map((event) => ({ ...event, performances: (event.performances ?? []).map((performance) => ({ ...performance, tracks: performance.tracks.map((track) => track.songId === sourceId ? { ...track, songId: targetId, performedTitle: track.performedTitle ?? source.displayTitle } : track) })) })) };
  return validatePlannerStore(next);
}

export function similarCatalogSongs(songs, artist, title) {
  const text = normalizeIdentityText(title);
  if (text.length < 3) return [];
  const distance = (left, right) => {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 0; i < left.length; i += 1) {
      const next = [i + 1];
      for (let j = 0; j < right.length; j += 1) next.push(Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + Number(left[i] !== right[j])));
      previous = next;
    }
    return previous[right.length];
  };
  return songs.filter((song) => !song.mergedIntoSongId && normalizeIdentityText(song.displayArtist) === normalizeIdentityText(artist) && [song.displayTitle, ...(song.aliases ?? [])].some((name) => { const other = normalizeIdentityText(name); return text !== other && (other.includes(text) || text.includes(other) || distance(text, other) <= Math.max(1, Math.floor(text.length / 6))); }));
}

export function normalizeIdentityText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ja-JP");
}

export function songCanonicalKey(artist, title) {
  return `${normalizeIdentityText(artist)}::${normalizeIdentityText(title)}`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stableSongId(artist, title) {
  return `song_${stableHash(songCanonicalKey(artist, title))}`;
}

export function stableArtistId(artist) {
  return `artist_${stableHash(normalizeIdentityText(artist))}`;
}

export function archiveIdentitySet(archive) {
  const identities = new Set();
  for (const setlist of archive ?? []) {
    for (const song of setlist.songs ?? []) {
      if (song.artist && song.title) identities.add(songCanonicalKey(song.artist, song.title));
    }
  }
  return identities;
}

export function upsertPerformance(store, eventId, artistName, titles, historicalIdentities, now = new Date().toISOString()) {
  const artist = String(artistName ?? "").trim();
  const cleanTitles = (titles ?? []).map((entry) => typeof entry === "string"
    ? { title: entry.trim(), section: "main" }
    : { ...entry, title: String(entry?.title ?? "").trim(), section: SETLIST_SECTIONS.includes(entry?.section) ? entry.section : "main" })
    .filter((entry) => entry.title);
  if (!artist || cleanTitles.length === 0) return store;
  if (!store.events.some((event) => event.id === eventId)) throw new TypeError("ライブを選択してください。");

  const nextSongs = [...store.songs];
  const knownKeys = new Set([
    ...historicalIdentities,
    ...nextSongs.map((song) => song.canonicalKey),
  ]);
  const trackRows = [];

  cleanTitles.forEach((entry, index) => {
    const displayTitle = entry.title;
    const section = entry.section;
    if (!displayTitle) return;
    const canonicalKey = songCanonicalKey(artist, displayTitle);
    let song = entry.songId ? nextSongs.find((row) => row.id === entry.songId && !row.mergedIntoSongId) : findCatalogSong(nextSongs, artist, displayTitle);
    if (entry.songId && (!song || normalizeIdentityText(song.displayArtist) !== normalizeIdentityText(artist))) throw new TypeError("選択した曲とアーティストが一致しません。");
    if (!song) {
      const firstHeardAtThisEvent = !knownKeys.has(canonicalKey);
      song = {
        id: nextSongs.some((row) => row.id === stableSongId(artist, displayTitle)) ? `song_${crypto.randomUUID()}` : stableSongId(artist, displayTitle),
        artistId: stableArtistId(artist),
        displayArtist: artist,
        displayTitle,
        canonicalKey,
        firstHeardEventId: firstHeardAtThisEvent ? eventId : null,
        playlistStatus: firstHeardAtThisEvent ? "candidate" : "unreviewed",
        createdAt: now,
        updatedAt: now,
      };
      nextSongs.push(song);
      knownKeys.add(canonicalKey);
    }
    trackRows.push({ songId: song.id, position: index + 1, section, ...(entry.performedTitle?.trim() ? { performedTitle: entry.performedTitle.trim() } : {}), ...(entry.performanceNote?.trim() ? { performanceNote: entry.performanceNote.trim() } : {}) });
  });

  const nextEvents = store.events.map((event) => {
    if (event.id !== eventId) return event;
    const performance = {
      id: `performance_${stableHash(`${eventId}:${normalizeIdentityText(artist)}`)}`,
      artistId: stableArtistId(artist),
      artistName: artist,
      tracks: trackRows,
    };
    const performances = [
      ...(event.performances ?? []).filter((entry) => entry.artistId !== performance.artistId),
      performance,
    ];
    const artists = [...new Set([...(event.artists ?? []), artist])];
    return {
      ...event,
      status: "attended",
      artists,
      performances,
      needsPostEventReview: false,
      reviewCompletedAt: now,
      updatedAt: now,
    };
  });

  return { ...store, songs: nextSongs, events: nextEvents };
}

export function buildMonthlyAttendance(setlists, months = 12, today = localDateString()) {
  const end = new Date(`${today}T00:00:00`);
  const rows = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    rows.push({ key, label: `${date.getMonth() + 1}月`, festival: 0, one_man: 0, taiban: 0, unclassified: 0, total: 0 });
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  for (const setlist of setlists ?? []) {
    const row = byKey.get(String(setlist.date ?? "").slice(0, 7));
    if (!row) continue;
    const type = EVENT_TYPES.includes(setlist.eventType) ? setlist.eventType : "unclassified";
    row[type] += 1;
    row.total += 1;
  }
  return rows;
}

export function buildArtistSongRanking(setlists, artist) {
  return buildSongRanking((setlists ?? []).map((setlist) => ({
    ...setlist,
    songs: (setlist.songs ?? []).filter((song) => normalizeIdentityText(song.artist) === normalizeIdentityText(artist)),
  }))).filter((entry) => normalizeIdentityText(entry.artist) === normalizeIdentityText(artist));
}

export function updatePlaylistStatus(store, songId, playlistStatus, now = new Date().toISOString(), reason) {
  const song = store.songs.find((row) => row.id === songId);
  if (playlistStatus === "unavailable" && !(reason ?? song?.playlistReason)?.trim()) throw new TypeError("登録不可の理由を入力してください。");
  if (!PLAYLIST_STATUSES.includes(playlistStatus)) return store;
  return {
    ...store,
    songs: store.songs.map((song) => song.id === songId ? { ...song, playlistStatus, ...(reason !== undefined ? { playlistReason: reason.trim() } : {}), updatedAt: now } : song),
  };
}

export function getReminders(store, today = localDateString()) {
  const reminders = [];
  for (const event of store.events) {
    if (["lost", "cancelled"].includes(event.status)) continue;

    const pendingRound = (event.lotteryRounds ?? []).find((round) =>
      round.resultDate && round.resultDate < today && (round.result ?? "pending") === "pending");
    if (pendingRound && ["applied", "waiting_result"].includes(event.status)) {
      reminders.push({ id: `lottery:${event.id}:${pendingRound.id}`, eventId: event.id, kind: "lottery", message: `${event.title}の抽選結果を入力してください。` });
    }

    const createdDate = typeof event.createdAt === "string" ? event.createdAt.slice(0, 10) : "";
    if (event.date >= today || (createdDate && createdDate < store.trackingEnabledAt)) continue;
    if (event.status === "confirmed") {
      reminders.push({ id: `attendance:${event.id}`, eventId: event.id, kind: "attendance", message: `${event.date}の${event.title}に参戦しましたか？` });
      continue;
    }
    if (event.status === "attended" && event.needsPostEventReview !== false) {
      const hasArtists = (event.artists ?? []).length > 0;
      const hasSetlist = (event.performances ?? []).some((performance) => (performance.tracks ?? []).length > 0);
      if (!hasArtists || !hasSetlist) {
        reminders.push({ id: `setlist:${event.id}`, eventId: event.id, kind: "setlist", message: `${event.title}のセトリがまだ登録されていません。` });
      }
    }
  }
  return reminders;
}

export function getUpcomingEvents(store, today = localDateString()) {
  return store.events
    .filter((event) => event.date >= today && !["lost", "cancelled", "attended"].includes(event.status))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function buildSongRanking(setlists) {
  const counts = new Map();
  for (const setlist of setlists ?? []) {
    for (const song of setlist.songs ?? []) {
      const key = songCanonicalKey(song.artist, song.title);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { title: song.title, artist: song.artist, count: 1 });
    }
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title));
}

export function buildArtistRanking(setlists) {
  const counts = new Map();
  for (const setlist of setlists ?? []) {
    for (const artist of new Set((setlist.songs ?? []).map((song) => song.artist).filter(Boolean))) {
      const ids = counts.get(artist) ?? new Set();
      ids.add(setlist.id);
      counts.set(artist, ids);
    }
  }
  return [...counts.entries()]
    .map(([artist, ids]) => ({ artist, count: ids.size }))
    .sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist));
}

export function eventToArchiveSetlist(event, songs) {
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const rows = [];
  for (const performance of event.performances ?? []) {
    for (const track of performance.tracks ?? []) {
      const song = songsById.get(track.songId);
      if (!song) continue;
      rows.push({
        id: Number.parseInt(stableHash(`${event.id}:${performance.id}:${track.position}`), 36),
        title: track.performedTitle || song.displayTitle,
        performanceNote: track.performanceNote,
        artist: song.displayArtist,
        key: "—",
        duration: "—",
        energy: 0,
        position: track.position,
        section: SETLIST_SECTIONS.includes(track.section) ? track.section : "main",
      });
    }
  }
  return {
    id: -Number.parseInt(stableHash(event.id), 36),
    title: event.title,
    venue: event.venue ?? "",
    date: event.date,
    notes: event.memo ?? "",
    eventType: EVENT_TYPES.includes(event.eventType) ? event.eventType : null,
    songs: rows,
    source: "local",
  };
}
