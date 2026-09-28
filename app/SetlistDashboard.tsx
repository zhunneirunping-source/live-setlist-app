'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  EVENT_STATUSES, EVENT_STATUS_LABELS, EVENT_TYPES, EVENT_TYPE_LABELS,
  PLAYLIST_STATUSES, PLAYLIST_STATUS_LABELS, PLANNER_STORAGE_KEY,
  SETLIST_SECTIONS, SETLIST_SECTION_LABELS, archiveIdentitySet,
  buildArtistRanking, buildArtistSongRanking, buildMonthlyAttendance, buildPlannerMigrationReview, buildSongRanking,
  createPlannerStore, eventToArchiveSetlist, getReminders, getUpcomingEvents,
  isPlannerStoreEmpty, loadPlannerStore, localDateString, mergePlannerMigrationCandidates, plannerMigrationKey,
  updatePlaylistStatus, upsertPerformance,
} from "@/lib/live-planner.js";

type EventStatus = "interested" | "applied" | "waiting_result" | "confirmed" | "lost" | "cancelled" | "attended";
type EventType = "festival" | "one_man" | "taiban";
type PlaylistStatus = "unreviewed" | "candidate" | "already_added" | "added" | "dismissed";
type SetlistSection = "rehearsal" | "main" | "encore";
type Song = { id: number; title: string; artist: string; key: string; duration: string; energy: number; position?: number; section?: SetlistSection };
type ArchiveSetlist = { id: number; title: string; venue: string; date: string; notes: string; songs: Song[]; source?: "archive" | "cloud"; eventType?: EventType | null };
type LotteryRound = { id: string; applicationDate: string; resultDate: string; result: "pending" | "won" | "lost"; ticketType: string; memo: string };
type Performance = { id: string; artistId: string; artistName: string; tracks: Array<{ songId: string; position: number; section?: SetlistSection }> };
type LiveEvent = { id: string; title: string; date: string; venue: string; eventType?: EventType; url: string; memo: string; status: EventStatus; artists: string[]; lotteryRounds: LotteryRound[]; performances: Performance[]; needsPostEventReview: boolean; reviewCompletedAt: string | null; createdAt: string; updatedAt: string };
type CatalogSong = { id: string; artistId: string; displayArtist: string; displayTitle: string; canonicalKey: string; firstHeardEventId: string | null; playlistStatus: PlaylistStatus; createdAt: string; updatedAt: string };
type PlannerStore = { version: 1; trackingEnabledAt: string; events: LiveEvent[]; songs: CatalogSong[] };
type EventDraft = { id: string; title: string; date: string; venue: string; eventType: EventType; url: string; memo: string; status: EventStatus; artists: string[]; newArtist: string; applicationDate: string; resultDate: string; lotteryResult: "pending" | "won" | "lost"; ticketType: string; lotteryMemo: string };
type TrackDraft = { id: string; section: SetlistSection; title: string };
type MigrationReview = ReturnType<typeof buildPlannerMigrationReview>;

const createId = (prefix: string) => `${prefix}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const emptyDraft = (): EventDraft => ({ id: "", title: "", date: "", venue: "", eventType: "one_man", url: "", memo: "", status: "interested", artists: [], newArtist: "", applicationDate: "", resultDate: "", lotteryResult: "pending", ticketType: "", lotteryMemo: "" });
const newTrack = (): TrackDraft => ({ id: createId("track"), section: "main", title: "" });
const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, "/") : value || "日付未定";
const tone = (status: EventStatus) => status === "confirmed" || status === "attended" ? "success" : status === "lost" || status === "cancelled" ? "quiet" : status === "waiting_result" || status === "applied" ? "warning" : "info";

function normalizeSong(song: Partial<Song> & { durationSeconds?: number | null }): Song {
  const seconds = typeof song.durationSeconds === "number" ? song.durationSeconds : 0;
  return { id: Number(song.id ?? Date.now()), title: song.title?.trim() || "Untitled song", artist: song.artist?.trim() || "Unknown artist", key: song.key?.trim() || "—", duration: song.duration?.trim() || (seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "—"), energy: Number(song.energy ?? 0), position: song.position, section: song.section };
}

function toDraft(event: LiveEvent): EventDraft {
  const lottery = event.lotteryRounds[0];
  return { id: event.id, title: event.title, date: event.date, venue: event.venue, eventType: event.eventType ?? "one_man", url: event.url, memo: event.memo, status: event.status, artists: event.artists, newArtist: "", applicationDate: lottery?.applicationDate ?? "", resultDate: lottery?.resultDate ?? "", lotteryResult: lottery?.result ?? "pending", ticketType: lottery?.ticketType ?? "", lotteryMemo: lottery?.memo ?? "" };
}

export function SetlistDashboard() {
  const [archive, setArchive] = useState<ArchiveSetlist[]>([]);
  const [archiveError, setArchiveError] = useState("");
  const [archiveReady, setArchiveReady] = useState(false);
  const [store, setStore] = useState<PlannerStore>(() => createPlannerStore() as PlannerStore);
  const [revision, setRevision] = useState(0);
  const [cloudReady, setCloudReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [migrationSource, setMigrationSource] = useState<PlannerStore | null>(null);
  const [migrationReview, setMigrationReview] = useState<MigrationReview | null>(null);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"home" | "lives" | "setlists" | "playlist" | "dashboard">("home");
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | EventStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | EventType>("all");
  const [historyMonths, setHistoryMonths] = useState(12);
  const [setlistEventId, setSetlistEventId] = useState("");
  const [setlistArtist, setSetlistArtist] = useState("");
  const [newSetlistArtist, setNewSetlistArtist] = useState("");
  const [tracks, setTracks] = useState<TrackDraft[]>([newTrack()]);
  const [playlistFilter, setPlaylistFilter] = useState<"all" | PlaylistStatus>("all");
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [selectedAnalyticsArtist, setSelectedAnalyticsArtist] = useState<string | null>(null);
  const [modalId, setModalId] = useState<number | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [rankLimit, setRankLimit] = useState(10);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = loadPlannerStore(window.localStorage.getItem(PLANNER_STORAGE_KEY)) as { store: PlannerStore; recovered: boolean };
      if (local.recovered) setNotice("端末データを読み込めませんでした。元データは削除していません。");
      try {
        const localHasData = !isPlannerStoreEmpty(local.store);
        const migrationKey = localHasData ? plannerMigrationKey(local.store) : "";
        const response = await fetch(`/api/planner${migrationKey ? `?migrationKey=${encodeURIComponent(migrationKey)}` : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error("cloud unavailable");
        let state = await response.json() as { store: PlannerStore; revision: number; empty: boolean; migrationRecorded?: boolean };
        if (state.empty && localHasData) {
          const migration = await fetch("/api/planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ store: local.store, migrationKey }) });
          if (!migration.ok) throw new Error("migration failed");
          state = await migration.json() as typeof state;
          setNotice("端末のPlannerデータをCloudへ移行しました。端末の元データは保持しています。");
        } else if (localHasData && !state.migrationRecorded) {
          const review = buildPlannerMigrationReview(local.store, state.store) as MigrationReview;
          if (review.hasCandidates || review.hasConflicts) {
            setMigrationSource(local.store);
            setMigrationReview(review);
          }
        }
        if (!cancelled) { setStore(state.store); setRevision(state.revision); setCloudReady(true); }
      } catch {
        if (!cancelled) setNotice("共有Plannerへ接続できません。過去の記録は閲覧できますが、更新はできません。");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/setlists", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json() as { setlists?: Array<{ id?: number; title?: string; venue?: string; date?: string; notes?: string; eventType?: EventType }> };
        const rows = (data.setlists ?? []).map((row) => ({ id: Number(row.id ?? 0), title: row.title ?? "", venue: row.venue ?? "", date: row.date ?? "", notes: row.notes ?? "", songs: [] as Song[], source: "archive" as const, eventType: row.eventType ?? null }));
        const details = await Promise.all(rows.map(async (row) => {
          const result = await fetch(`/api/setlists?setlistId=${row.id}`, { cache: "no-store" });
          if (!result.ok) return row;
          const detail = await result.json() as { songs?: Array<Partial<Song> & { durationSeconds?: number | null }> };
          return { ...row, songs: (detail.songs ?? []).map(normalizeSong) };
        }));
        if (!cancelled) { setArchive(details); setArchiveReady(true); }
      } catch { if (!cancelled) setArchiveError("過去のセトリを読み込めませんでした。再読み込みしてください。"); }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveStore = async (next: PlannerStore, success: string): Promise<boolean> => {
    if (!cloudReady || saving) return false;
    setSaving(true);
    try {
      const response = await fetch("/api/planner", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ store: next, revision }) });
      const data = await response.json() as { store?: PlannerStore; revision?: number; error?: string };
      if (response.status === 409 && data.store && typeof data.revision === "number") {
        setStore(data.store); setRevision(data.revision); setNotice("別の端末で更新されました。最新データを読み込みました。もう一度操作してください。"); return false;
      }
      if (!response.ok || !data.store || typeof data.revision !== "number") throw new Error(data.error);
      setStore(data.store); setRevision(data.revision); setNotice(success);
      return true;
    } catch { setNotice("Cloudへ保存できませんでした。入力内容は画面に反映していません。再試行してください。"); return false; }
    finally { setSaving(false); }
  };

  const importMigrationCandidates = async () => {
    if (!migrationSource || !migrationReview?.hasCandidates || saving) return;
    const merged = mergePlannerMigrationCandidates(store, migrationSource) as { store: PlannerStore; review: MigrationReview };
    setSaving(true);
    try {
      const response = await fetch("/api/planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "reviewed_merge",
          store: merged.store,
          sourceStore: migrationReview.hasConflicts ? undefined : migrationSource,
          migrationKey: plannerMigrationKey(migrationSource),
          revision,
        }),
      });
      const data = await response.json() as { store?: PlannerStore; revision?: number; error?: string };
      if (response.status === 409 && data.store && typeof data.revision === "number") {
        setStore(data.store); setRevision(data.revision);
        const latestReview = buildPlannerMigrationReview(migrationSource, data.store) as MigrationReview;
        setMigrationReview(latestReview.hasCandidates || latestReview.hasConflicts ? latestReview : null);
        setNotice("別の端末で更新されました。最新データで移行候補を再確認してください。");
        return;
      }
      if (!response.ok || !data.store || typeof data.revision !== "number") throw new Error(data.error);
      setStore(data.store); setRevision(data.revision);
      const remaining = buildPlannerMigrationReview(migrationSource, data.store) as MigrationReview;
      setMigrationReview(remaining.hasCandidates || remaining.hasConflicts ? remaining : null);
      if (!remaining.hasCandidates && !remaining.hasConflicts) setMigrationSource(null);
      setNotice(remaining.hasConflicts ? "安全に追加できる端末データをCloudへ追加しました。競合は変更せず残しています。" : "端末だけにあったPlannerデータをCloudへ追加しました。端末の元データは保持しています。");
    } catch {
      setNotice("端末データをCloudへ追加できませんでした。端末の元データは変更していません。");
    } finally {
      setSaving(false);
    }
  };

  const localSetlists = useMemo(() => store.events.filter((event) => event.status === "attended" && event.performances.length).map((event) => ({ ...eventToArchiveSetlist(event, store.songs), source: "cloud" as const }) as ArchiveSetlist), [store]);
  const allSetlists = useMemo(() => [...archive, ...localSetlists].sort((a, b) => b.date.localeCompare(a.date)), [archive, localSetlists]);
  const historyKeys = useMemo(() => archiveIdentitySet(archive), [archive]);
  const today = localDateString();
  const reminders = useMemo(() => getReminders(store) as Array<{ id: string; eventId: string; kind: string; message: string }>, [store]);
  const upcoming = useMemo(() => getUpcomingEvents(store, today) as LiveEvent[], [store, today]);
  const candidates = useMemo(() => store.songs.filter((song) => ["unreviewed", "candidate"].includes(song.playlistStatus)), [store.songs]);
  const venueOptions = useMemo(() => [...new Set([...archive.map((row) => row.venue), ...store.events.map((event) => event.venue)].filter(Boolean))].sort(), [archive, store.events]);
  const artistOptions = useMemo(() => [...new Set([...archive.flatMap((row) => row.songs.map((song) => song.artist)), ...store.songs.map((song) => song.displayArtist), ...store.events.flatMap((event) => event.artists)].filter(Boolean))].sort(), [archive, store]);
  const songOptions = useMemo(() => [...new Set([...archive.flatMap((row) => row.songs.filter((song) => song.artist === setlistArtist).map((song) => song.title)), ...store.songs.filter((song) => song.displayArtist === setlistArtist).map((song) => song.displayTitle)])].sort(), [archive, store.songs, setlistArtist]);
  const filteredEvents = useMemo(() => store.events.filter((event) => (statusFilter === "all" || event.status === statusFilter) && (typeFilter === "all" || event.eventType === typeFilter)).sort((a, b) => b.date.localeCompare(a.date)), [store.events, statusFilter, typeFilter]);
  const monthly = useMemo(() => buildMonthlyAttendance(allSetlists, historyMonths, today) as Array<{ key: string; label: string; festival: number; one_man: number; taiban: number; unclassified: number; total: number }>, [allSetlists, historyMonths, today]);
  const maxMonth = Math.max(1, ...monthly.map((row) => row.total));
  const songRanking = useMemo(() => buildSongRanking(allSetlists) as Array<{ title: string; artist: string; count: number }>, [allSetlists]);
  const artistRanking = useMemo(() => buildArtistRanking(allSetlists) as Array<{ artist: string; count: number }>, [allSetlists]);
  const artistSongRanking = useMemo(() => selectedAnalyticsArtist ? buildArtistSongRanking(allSetlists, selectedAnalyticsArtist) as Array<{ title: string; artist: string; count: number }> : [], [allSetlists, selectedAnalyticsArtist]);
  const modal = allSetlists.find((setlist) => setlist.id === modalId) ?? null;
  const modalArtists = useMemo(() => { const groups = new Map<string, Song[]>(); modal?.songs.forEach((song) => groups.set(song.artist, [...(groups.get(song.artist) ?? []), song])); return [...groups].map(([artist, songs]) => ({ artist, songs })); }, [modal]);
  const activeArtist = selectedArtist && modalArtists.some((group) => group.artist === selectedArtist) ? selectedArtist : modalArtists[0]?.artist ?? null;
  const closeModal = () => { setModalId(null); window.setTimeout(() => dialogTriggerRef.current?.focus(), 0); };

  useEffect(() => { if (!modal) return; closeRef.current?.focus(); const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") closeModal(); if (event.key !== "Tab") return; const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]; if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [modal]);

  const saveEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = new Date().toISOString(); const id = draft.id || createId("event"); const old = store.events.find((item) => item.id === id);
    const newArtists = draft.newArtist.split(/[、,\n]/).map((value) => value.trim()).filter(Boolean);
    const lotteryRounds: LotteryRound[] = draft.applicationDate || draft.resultDate || draft.ticketType || draft.lotteryMemo ? [{ id: old?.lotteryRounds[0]?.id ?? createId("lottery"), applicationDate: draft.applicationDate, resultDate: draft.resultDate, result: draft.lotteryResult, ticketType: draft.ticketType, memo: draft.lotteryMemo }] : [];
    const status: EventStatus = draft.lotteryResult === "lost" ? "lost" : draft.lotteryResult === "won" && ["applied", "waiting_result"].includes(draft.status) ? "confirmed" : draft.status;
    const nextEvent: LiveEvent = { id, title: draft.title.trim(), date: draft.date, venue: draft.venue.trim(), eventType: draft.eventType, url: draft.url.trim(), memo: draft.memo.trim(), status, artists: [...new Set([...draft.artists, ...newArtists])], lotteryRounds, performances: old?.performances ?? [], needsPostEventReview: status === "attended" ? old?.needsPostEventReview ?? true : false, reviewCompletedAt: old?.reviewCompletedAt ?? null, createdAt: old?.createdAt ?? now, updatedAt: now };
    const next = { ...store, events: [...store.events.filter((item) => item.id !== id), nextEvent] };
    void saveStore(next, "ライブ情報をCloudへ保存しました。").then((saved) => { if (saved) { setDraft(emptyDraft()); setShowForm(false); } });
  };
  const editEvent = (event: LiveEvent) => { setDraft(toDraft(event)); setShowForm(true); setTab("lives"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const reviewEvent = (eventId: string) => { const next = { ...store, events: store.events.map((event) => event.id === eventId ? { ...event, status: "attended" as const, needsPostEventReview: true, updatedAt: new Date().toISOString() } : event) }; void saveStore(next, "参戦済みに更新しました。").then((saved) => { if (saved) { setSetlistEventId(eventId); setTab("setlists"); } }); };
  const saveSetlist = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!archiveReady) return; const artist = newSetlistArtist.trim() || setlistArtist; const filled = tracks.filter((track) => track.title.trim()).map((track) => ({ title: track.title.trim(), section: track.section })); const next = upsertPerformance(store, setlistEventId, artist, filled, historyKeys) as PlannerStore; void saveStore(next, "セトリを保存し、集計とプレイリスト候補を更新しました。").then((saved) => { if (saved) { setTracks([newTrack()]); setNewSetlistArtist(""); } }); };
  const changePlaylist = (songId: string, status: PlaylistStatus) => void saveStore(updatePlaylistStatus(store, songId, status) as PlannerStore, "プレイリスト状態を更新しました。");
  const bulkPlaylist = (status: PlaylistStatus) => { let next = store; selectedPlaylistIds.forEach((id) => { next = updatePlaylistStatus(next, id, status) as PlannerStore; }); void saveStore(next, `${selectedPlaylistIds.length}曲を更新しました。`).then((saved) => { if (saved) setSelectedPlaylistIds([]); }); };
  const moveTrack = (index: number, delta: number) => setTracks((current) => { const target = index + delta; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const navigation = [["home", "ホーム"], ["lives", "ライブ管理"], ["setlists", "セトリ"], ["playlist", "追加候補"], ["dashboard", "集計"]] as const;

  return <main className="setlist-page">
    <nav className="main-tab-bar" aria-label="メイン画面">{navigation.map(([key, label]) => <button key={key} type="button" className={tab === key ? "tab-button active" : "tab-button"} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}><span className="nav-label">{label}</span>{key === "playlist" && candidates.length > 0 && <span className="nav-count">{candidates.length}</span>}</button>)}</nav>
    {notice && <div className="inline-notice" role="status">{notice}</div>}
    {migrationReview && <section className="migration-review" aria-labelledby="migration-review-title">
      <div><h2 id="migration-review-title">この端末にCloud未反映のデータがあります</h2><p>Cloudの既存データは上書きしません。端末の元データも削除しません。</p></div>
      <dl><div><dt>安全に追加できるライブ</dt><dd>{migrationReview.safeEvents.length}件</dd></div><div><dt>安全に追加できる曲</dt><dd>{migrationReview.safeSongs.length}曲</dd></div><div><dt>要確認の競合</dt><dd>{migrationReview.eventConflicts.length + migrationReview.songConflicts.length}件</dd></div></dl>
      {migrationReview.safeEvents.length > 0 && <ul>{migrationReview.safeEvents.map((event) => <li key={event.id}>{displayDate(event.date)} {event.title}</li>)}</ul>}
      {migrationReview.hasConflicts && <div className="migration-warning"><p>同じIDまたは曲に異なる内容があります。競合分はCloudへ反映せず、この端末に保持します。</p><ul>{migrationReview.eventConflicts.map(({ local }) => <li key={`event:${local.id}`}>ライブ: {displayDate(local.date)} {local.title}</li>)}{migrationReview.songConflicts.map(({ local }) => <li key={`song:${local.id}`}>曲: {local.displayArtist} / {local.displayTitle}</li>)}</ul></div>}
      {migrationReview.hasCandidates && <button type="button" className="primary-button" disabled={saving} onClick={() => void importMigrationCandidates()}>候補をCloudへ追加</button>}
    </section>}

    {tab === "home" && <section className="workspace-page" aria-labelledby="home-title">
      <header className="page-heading compact-heading"><h1 id="home-title">ホーム</h1></header>
      <section className="history-section"><div className="section-header"><div><h2>ライブ参戦履歴</h2><p>{historyMonths === 6 ? "直近6か月" : historyMonths === 12 ? "直近1年" : "直近5年"}・月別</p></div><div className="select-inline" aria-label="集計期間">{[[6, "6か月"], [12, "1年"], [60, "5年"]].map(([value, label]) => <button key={value} type="button" className={historyMonths === value ? "mini-button active" : "mini-button"} onClick={() => setHistoryMonths(Number(value))}>{label}</button>)}</div></div><div className="stacked-chart" aria-label="月別ライブ参戦数">{monthly.map((row) => <div className="month-column" key={row.key}><span className="month-total">{row.total || ""}</span><div className="month-bar" style={{ height: `${Math.max(row.total ? 12 : 2, row.total / maxMonth * 112)}px` }}>{(["festival", "one_man", "taiban", "unclassified"] as const).map((type) => row[type] > 0 && <span key={type} className={`bar-segment ${type}`} style={{ flex: row[type] }} title={`${type === "unclassified" ? "未分類" : EVENT_TYPE_LABELS[type]} ${row[type]}件`} />)}</div><small>{historyMonths > 12 && ![1, 4, 7, 10].includes(Number(row.key.slice(5))) ? "" : row.label}</small></div>)}</div><div className="chart-legend">{(EVENT_TYPES as EventType[]).map((type) => <span key={type}><i className={`legend-dot ${type}`} />{EVENT_TYPE_LABELS[type]}</span>)}<span><i className="legend-dot unclassified" />未分類（要確認）</span></div></section>
      <section className="summary-section"><div className="section-header"><h2>これからのライブ</h2><button type="button" className="text-button" onClick={() => { setDraft(emptyDraft()); setShowForm(true); setTab("lives"); }}>登録する</button></div>{upcoming.length === 0 ? <p className="empty-state">参戦予定・抽選中のライブはありません。</p> : <ul className="compact-event-list">{upcoming.slice(0, 5).map((event) => <li key={event.id}><time dateTime={event.date}>{displayDate(event.date)}</time><strong>{event.title}</strong><span className={`status-badge ${tone(event.status)}`}>{EVENT_STATUS_LABELS[event.status]}</span>{event.lotteryRounds[0]?.resultDate && <small>発表 {displayDate(event.lotteryRounds[0].resultDate)}</small>}</li>)}</ul>}</section>
      <section className="action-section"><div className="section-header"><h2>対応が必要</h2><span className="count-label">{reminders.length}件</span></div>{reminders.length === 0 ? <p className="empty-state">今すぐ対応する記録はありません。</p> : <ul className="action-list">{reminders.map((reminder) => <li key={reminder.id}><span>{reminder.message}</span><div className="row-actions"><button type="button" className="secondary-button" onClick={() => reminder.kind === "lottery" ? editEvent(store.events.find((item) => item.id === reminder.eventId)!) : reviewEvent(reminder.eventId)}>{reminder.kind === "lottery" ? "結果を入力" : "セトリを登録"}</button><button type="button" className="text-button" onClick={() => setTab("playlist")}>追加候補</button></div></li>)}</ul>}</section>
      <section className="summary-section"><div className="section-header"><h2>プレイリスト追加候補</h2><strong>{candidates.length}曲</strong></div><button type="button" className="secondary-button" onClick={() => setTab("playlist")}>候補を確認</button></section>
    </section>}

    {tab === "lives" && <section className="workspace-page" aria-labelledby="lives-title">
      <header className="page-heading page-heading-action"><h1 id="lives-title">ライブ管理</h1><button type="button" className="primary-button" disabled={!cloudReady || saving} onClick={() => { if (!showForm) setDraft(emptyDraft()); setShowForm(!showForm); }}>{showForm ? "フォームを閉じる" : "ライブを登録"}</button></header>
      {showForm && <form className="editor-form" onSubmit={saveEvent}><div className="form-section"><h2>基本情報</h2><div className="form-grid">
        <label className="field field-wide"><span>ライブ / フェス名 *</span><input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="field"><span>公演日 *</span><input required type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label><label className="field"><span>参加ステータス *</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as EventStatus })}>{(EVENT_STATUSES as EventStatus[]).map((status) => <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>)}</select></label>
        <label className="field"><span>ライブ形式 *</span><select value={draft.eventType} onChange={(e) => setDraft({ ...draft, eventType: e.target.value as EventType })}>{(EVENT_TYPES as EventType[]).map((type) => <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>)}</select></label>
        <label className="field"><span>会場</span><input list="venue-options" value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} /><datalist id="venue-options">{venueOptions.map((venue) => <option key={venue} value={venue} />)}</datalist><small>過去の会場を選ぶか、新しい会場名を入力</small></label>
        <label className="field field-wide"><span>出演アーティスト</span><div className="checkbox-grid">{artistOptions.slice(0, 30).map((artist) => <label key={artist} className="check-choice"><input type="checkbox" checked={draft.artists.includes(artist)} onChange={(e) => setDraft({ ...draft, artists: e.target.checked ? [...draft.artists, artist] : draft.artists.filter((value) => value !== artist) })} />{artist}</label>)}</div><input aria-label="新しいアーティスト" placeholder="新しいアーティスト（複数は「、」で区切る）" value={draft.newArtist} onChange={(e) => setDraft({ ...draft, newArtist: e.target.value })} /></label>
        <label className="field"><span>URL</span><input type="url" inputMode="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label><label className="field"><span>メモ</span><textarea rows={3} value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} /></label>
      </div></div><details className="form-details" open={["applied", "waiting_result"].includes(draft.status)}><summary>抽選情報</summary><div className="form-grid details-grid"><label className="field"><span>申込日</span><input type="date" value={draft.applicationDate} onChange={(e) => setDraft({ ...draft, applicationDate: e.target.value })} /></label><label className="field"><span>結果発表日</span><input type="date" value={draft.resultDate} onChange={(e) => setDraft({ ...draft, resultDate: e.target.value })} /></label><label className="field"><span>当落</span><select value={draft.lotteryResult} onChange={(e) => setDraft({ ...draft, lotteryResult: e.target.value as EventDraft["lotteryResult"] })}><option value="pending">結果待ち</option><option value="won">当選</option><option value="lost">落選</option></select></label><label className="field"><span>チケット種別</span><input value={draft.ticketType} onChange={(e) => setDraft({ ...draft, ticketType: e.target.value })} /></label><label className="field field-wide"><span>抽選メモ</span><textarea rows={2} value={draft.lotteryMemo} onChange={(e) => setDraft({ ...draft, lotteryMemo: e.target.value })} /></label></div></details><div className="form-actions"><button type="button" className="secondary-button" onClick={() => { setShowForm(false); setDraft(emptyDraft()); }}>キャンセル</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "保存中" : draft.id ? "変更を保存" : "ライブを保存"}</button></div></form>}
      <div className="filter-bar"><label>ステータス<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}><option value="all">すべて</option>{(EVENT_STATUSES as EventStatus[]).map((status) => <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>)}</select></label><label>ライブ形式<select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}><option value="all">すべて</option>{(EVENT_TYPES as EventType[]).map((type) => <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>)}</select></label></div>
      <div className="managed-event-list">{filteredEvents.length === 0 ? <p className="empty-state">条件に一致するライブはありません。</p> : filteredEvents.map((event) => <article className="managed-event-row" key={event.id}><div className="event-date-block"><time dateTime={event.date}>{displayDate(event.date)}</time><div className="badge-row"><span className={`status-badge ${tone(event.status)}`}>{EVENT_STATUS_LABELS[event.status]}</span><span className="type-badge">{EVENT_TYPE_LABELS[event.eventType ?? "one_man"]}</span></div></div><div className="event-copy"><h2>{event.title}</h2><p>{event.venue || "会場未登録"}</p>{event.lotteryRounds[0]?.resultDate && <small>結果発表 {displayDate(event.lotteryRounds[0].resultDate)}</small>}</div><div className="row-actions"><button type="button" className="secondary-button" onClick={() => editEvent(event)}>編集</button>{event.date < today && !["lost", "cancelled"].includes(event.status) && <button type="button" className="primary-button" onClick={() => reviewEvent(event.id)}>参戦記録</button>}</div></article>)}</div>
    </section>}

    {tab === "setlists" && <section className="workspace-page" aria-labelledby="setlists-title"><header className="page-heading compact-heading"><h1 id="setlists-title">セトリ</h1></header>
      <form className="editor-form compact-editor" onSubmit={saveSetlist}><h2>参戦後のセトリ登録</h2><div className="form-grid"><label className="field"><span>ライブ *</span><select required value={setlistEventId} onChange={(e) => { setSetlistEventId(e.target.value); setSetlistArtist(""); }}><option value="">選択してください</option>{store.events.filter((event) => !["lost", "cancelled"].includes(event.status)).sort((a, b) => b.date.localeCompare(a.date)).map((event) => <option key={event.id} value={event.id}>{displayDate(event.date)} {event.title}</option>)}</select></label><label className="field"><span>見たアーティスト *</span><select value={setlistArtist} onChange={(e) => { setSetlistArtist(e.target.value); setNewSetlistArtist(""); }}><option value="">新規追加</option>{[...new Set([...(store.events.find((event) => event.id === setlistEventId)?.artists ?? []), ...artistOptions])].map((artist) => <option key={artist} value={artist}>{artist}</option>)}</select>{!setlistArtist && <input required aria-label="新しいアーティスト" placeholder="新しいアーティスト" value={newSetlistArtist} onChange={(e) => setNewSetlistArtist(e.target.value)} />}</label></div>
      <div className="track-editor"><div className="track-header"><span>区分</span><span>曲</span><span>順序</span></div>{tracks.map((track, index) => <div className="track-row" key={track.id}><select aria-label={`${index + 1}曲目の区分`} value={track.section} onChange={(e) => setTracks((current) => current.map((row) => row.id === track.id ? { ...row, section: e.target.value as SetlistSection } : row))}>{(SETLIST_SECTIONS as SetlistSection[]).map((section) => <option key={section} value={section}>{SETLIST_SECTION_LABELS[section]}</option>)}</select><input list="song-options" aria-label={`${index + 1}曲目`} placeholder="曲名" value={track.title} onChange={(e) => setTracks((current) => current.map((row) => row.id === track.id ? { ...row, title: e.target.value } : row))} /><div className="track-actions"><button type="button" aria-label="上へ" onClick={() => moveTrack(index, -1)} disabled={index === 0}>↑</button><button type="button" aria-label="下へ" onClick={() => moveTrack(index, 1)} disabled={index === tracks.length - 1}>↓</button><button type="button" aria-label="削除" onClick={() => setTracks((current) => current.length === 1 ? [newTrack()] : current.filter((row) => row.id !== track.id))}>×</button></div></div>)}<datalist id="song-options">{songOptions.map((song) => <option key={song} value={song} />)}</datalist><button type="button" className="secondary-button add-track" onClick={() => setTracks((current) => [...current, newTrack()])}>曲を追加</button></div><div className="form-actions"><button type="submit" className="primary-button" disabled={!archiveReady || !cloudReady || saving}>{saving ? "保存中" : "セトリを保存"}</button></div></form>
      {archiveError && <p className="error-state" role="alert">{archiveError}</p>}<div className="archive-list event-list">{allSetlists.length === 0 ? <p className="empty-state">セトリはまだありません。</p> : allSetlists.map((setlist) => <button key={`${setlist.source}-${setlist.id}`} type="button" className="archive-item event-card" onClick={(event) => { dialogTriggerRef.current = event.currentTarget; setModalId(setlist.id); setSelectedArtist(null); }}><span className="archive-date">{displayDate(setlist.date)}</span><span className="archive-tag">{setlist.source === "cloud" ? "Cloud" : "Archive"}</span><strong>{setlist.title}</strong><small>{setlist.songs.length}曲</small></button>)}</div>
    </section>}

    {tab === "playlist" && <section className="workspace-page" aria-labelledby="playlist-title"><header className="page-heading compact-heading"><h1 id="playlist-title">プレイリスト追加候補</h1></header><div className="filter-bar playlist-tools"><label>状態<select value={playlistFilter} onChange={(e) => setPlaylistFilter(e.target.value as typeof playlistFilter)}><option value="all">すべて</option>{(PLAYLIST_STATUSES as PlaylistStatus[]).map((status) => <option key={status} value={status}>{PLAYLIST_STATUS_LABELS[status]}</option>)}</select></label>{selectedPlaylistIds.length > 0 && <div className="bulk-actions"><span>{selectedPlaylistIds.length}曲選択</span><button type="button" className="secondary-button" onClick={() => bulkPlaylist("added")}>今回追加</button><button type="button" className="secondary-button" onClick={() => bulkPlaylist("dismissed")}>追加しない</button></div>}</div>{store.songs.length === 0 ? <p className="empty-state">候補はまだありません。</p> : <ul className="playlist-list">{store.songs.filter((song) => playlistFilter === "all" || song.playlistStatus === playlistFilter).sort((a, b) => Number(a.playlistStatus !== "candidate") - Number(b.playlistStatus !== "candidate") || b.createdAt.localeCompare(a.createdAt)).map((song) => <li key={song.id} className="playlist-row"><label className="playlist-select"><input type="checkbox" checked={selectedPlaylistIds.includes(song.id)} onChange={(e) => setSelectedPlaylistIds((current) => e.target.checked ? [...current, song.id] : current.filter((id) => id !== song.id))} /><span className="sr-only">{song.displayTitle}を選択</span></label><div><strong>{song.displayTitle}</strong><span>{song.displayArtist}</span></div><select aria-label={`${song.displayTitle}の状態`} value={song.playlistStatus} onChange={(e) => changePlaylist(song.id, e.target.value as PlaylistStatus)}>{(PLAYLIST_STATUSES as PlaylistStatus[]).map((status) => <option key={status} value={status}>{PLAYLIST_STATUS_LABELS[status]}</option>)}</select></li>)}</ul>}</section>}

    {tab === "dashboard" && <section className="dashboard-page" aria-labelledby="dashboard-title"><header className="page-heading compact-heading"><h1 id="dashboard-title">集計</h1></header><section className="dashboard-section"><div className="section-header dashboard-header-row"><div><h2>よく聴いている曲</h2><p>全{songRanking.length}曲（重複をまとめた曲数）</p></div><div className="select-inline" aria-label="表示件数">{[10, 20, 50].map((value) => <button key={value} type="button" className={rankLimit === value ? "mini-button active" : "mini-button"} onClick={() => setRankLimit(value)}>{value}</button>)}</div></div><ol className="song-ranking-list">{songRanking.slice(0, rankLimit).map((entry, index) => <li key={`${entry.artist}:${entry.title}`} className="song-ranking-row"><span className="ranking-rank">#{index + 1}</span><div className="ranking-song-meta"><strong>{entry.title}</strong><small>{entry.artist}</small></div><span className="ranking-count">{entry.count}回</span></li>)}</ol></section><section className="dashboard-section"><div className="section-header"><div><h2>アーティスト一覧</h2><p>全{artistRanking.length}組・クリックで曲ランキングを表示</p></div></div><div className="artist-analysis-layout"><ol className="artist-ranking-list">{artistRanking.map((entry, index) => <li key={entry.artist}><button type="button" className={selectedAnalyticsArtist === entry.artist ? "artist-row active" : "artist-row"} onClick={() => setSelectedAnalyticsArtist(entry.artist)}><span>#{index + 1}</span><strong>{entry.artist}</strong><small>{entry.count}公演</small></button></li>)}</ol><aside className="artist-detail-panel" aria-live="polite">{selectedAnalyticsArtist ? <><h3>{selectedAnalyticsArtist}</h3><dl className="artist-summary"><div><dt>見た公演</dt><dd>{artistRanking.find((entry) => entry.artist === selectedAnalyticsArtist)?.count ?? 0}公演</dd></div><div><dt>全体比</dt><dd>{allSetlists.length ? (((artistRanking.find((entry) => entry.artist === selectedAnalyticsArtist)?.count ?? 0) / allSetlists.length) * 100).toFixed(1) : "0.0"}%</dd></div></dl><ol className="artist-song-list">{artistSongRanking.map((song, index) => <li key={song.title}><span>{index + 1}</span><strong>{song.title}</strong><small>{song.count}回</small></li>)}</ol></> : <p className="empty-state">アーティストを選ぶと曲ランキングを表示します。</p>}</aside></div></section></section>}

    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><section ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="setlist-dialog-title"><div className="modal-header"><h2 id="setlist-dialog-title">{modal.title}</h2><button ref={closeRef} type="button" className="close-button" aria-label="セトリ詳細を閉じる" onClick={closeModal}>×</button></div><dl className="modal-meta-grid"><div><dt>開催日</dt><dd>{displayDate(modal.date)}</dd></div><div><dt>会場</dt><dd>{modal.venue || "—"}</dd></div><div><dt>曲数</dt><dd>{modal.songs.length}曲</dd></div></dl><div className="artist-select-list">{modalArtists.map((group) => <button key={group.artist} type="button" className={activeArtist === group.artist ? "artist-chip active" : "artist-chip"} onClick={() => setSelectedArtist(group.artist)}>{group.artist}</button>)}</div>{activeArtist && <div className="artist-detail-panel"><h3>{activeArtist}</h3><ol className="artist-song-list">{modalArtists.find((group) => group.artist === activeArtist)?.songs.map((song, index) => <li key={`${song.id}-${index}`}><span>{song.section ? SETLIST_SECTION_LABELS[song.section] : String(index + 1).padStart(2, "0")}</span><strong>{song.title}</strong><small>{song.duration}</small></li>)}</ol></div>}</section></div>}
  </main>;
}
