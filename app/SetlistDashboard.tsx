'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  EVENT_STATUSES, EVENT_STATUS_LABELS, PLAYLIST_STATUSES, PLAYLIST_STATUS_LABELS,
  PLANNER_STORAGE_KEY, archiveIdentitySet, buildArtistRanking, buildSongRanking, createPlannerStore, eventToArchiveSetlist,
  getReminders, getUpcomingEvents, loadPlannerStore, localDateString,
  updatePlaylistStatus, upsertPerformance,
} from "@/lib/live-planner.js";

type EventStatus = "interested" | "applied" | "waiting_result" | "confirmed" | "lost" | "cancelled" | "attended";
type PlaylistStatus = "unreviewed" | "candidate" | "already_added" | "added" | "dismissed";
type Song = { id: number; title: string; artist: string; key: string; duration: string; energy: number; position?: number };
type ArchiveSetlist = { id: number; title: string; venue: string; date: string; notes: string; songs: Song[]; source?: "archive" | "local" };
type LotteryRound = { id: string; applicationDate: string; resultDate: string; result: "pending" | "won" | "lost"; ticketType: string; memo: string };
type Performance = { id: string; artistId: string; artistName: string; tracks: Array<{ songId: string; position: number }> };
type LiveEvent = { id: string; title: string; date: string; venue: string; url: string; memo: string; status: EventStatus; artists: string[]; lotteryRounds: LotteryRound[]; performances: Performance[]; needsPostEventReview: boolean; reviewCompletedAt: string | null; createdAt: string; updatedAt: string };
type CatalogSong = { id: string; artistId: string; displayArtist: string; displayTitle: string; canonicalKey: string; firstHeardEventId: string | null; playlistStatus: PlaylistStatus; createdAt: string; updatedAt: string };
type PlannerStore = { version: 1; trackingEnabledAt: string; events: LiveEvent[]; songs: CatalogSong[] };
type EventDraft = { id: string; title: string; date: string; venue: string; url: string; memo: string; status: EventStatus; artistsText: string; applicationDate: string; resultDate: string; lotteryResult: "pending" | "won" | "lost"; ticketType: string; lotteryMemo: string };

const emptyDraft = (): EventDraft => ({ id: "", title: "", date: "", venue: "", url: "", memo: "", status: "interested", artistsText: "", applicationDate: "", resultDate: "", lotteryResult: "pending", ticketType: "", lotteryMemo: "" });
const createId = (prefix: string) => `${prefix}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, "/") : value || "日付未定";
const formatDuration = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
const parseDuration = (value: string) => /^\d+:\d{1,2}$/.test(value) ? value.split(":").map(Number).reduce((minutes, seconds) => minutes * 60 + seconds) : 0;
const tone = (status: EventStatus) => status === "confirmed" || status === "attended" ? "success" : status === "lost" || status === "cancelled" ? "quiet" : status === "waiting_result" || status === "applied" ? "warning" : "info";

function normalizeSong(song: Partial<Song> & { durationSeconds?: number | null }): Song {
  return { id: Number(song.id ?? Date.now()), title: song.title?.trim() || "Untitled song", artist: song.artist?.trim() || "Unknown artist", key: song.key?.trim() || "—", duration: song.duration?.trim() || (typeof song.durationSeconds === "number" ? formatDuration(song.durationSeconds) : "—"), energy: Number(song.energy ?? 0), position: song.position };
}

function toDraft(event: LiveEvent): EventDraft {
  const lottery = event.lotteryRounds[0];
  return { id: event.id, title: event.title, date: event.date, venue: event.venue, url: event.url, memo: event.memo, status: event.status, artistsText: event.artists.join("、"), applicationDate: lottery?.applicationDate ?? "", resultDate: lottery?.resultDate ?? "", lotteryResult: lottery?.result ?? "pending", ticketType: lottery?.ticketType ?? "", lotteryMemo: lottery?.memo ?? "" };
}

export function SetlistDashboard() {
  const [archive, setArchive] = useState<ArchiveSetlist[]>([]);
  const [archiveError, setArchiveError] = useState("");
  const [archiveReady, setArchiveReady] = useState(false);
  const [store, setStore] = useState<PlannerStore>(() => createPlannerStore() as PlannerStore);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"home" | "lives" | "setlists" | "playlist" | "dashboard">("home");
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [setlistEventId, setSetlistEventId] = useState("");
  const [setlistArtist, setSetlistArtist] = useState("");
  const [setlistText, setSetlistText] = useState("");
  const [modalId, setModalId] = useState<number | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [rankLimit, setRankLimit] = useState(10);
  const requestId = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const loaded = loadPlannerStore(window.localStorage.getItem(PLANNER_STORAGE_KEY)) as { store: PlannerStore; recovered: boolean };
        setStore(loaded.store);
        if (loaded.recovered) setNotice("保存データを読み込めなかったため、新しい管理データで開始しました。");
      } catch { setNotice("このブラウザでは管理データを保存できません。"); }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(store)); }
    catch { window.setTimeout(() => setNotice("管理データを端末へ保存できませんでした。"), 0); }
  }, [hydrated, store]);

  useEffect(() => {
    const current = ++requestId.current;
    void (async () => {
      try {
        const response = await fetch("/api/setlists", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json() as { setlists?: Array<{ id?: number; title?: string; venue?: string; date?: string; notes?: string }> };
        const rows = (data.setlists ?? []).map((row) => ({ id: Number(row.id ?? 0), title: row.title ?? "", venue: row.venue ?? "", date: row.date ?? "", notes: row.notes ?? "", songs: [] as Song[], source: "archive" as const }));
        const details = await Promise.all(rows.map(async (row) => {
          const result = await fetch(`/api/setlists?setlistId=${row.id}`, { cache: "no-store" });
          if (!result.ok) return row;
          const detail = await result.json() as { songs?: Array<Partial<Song> & { durationSeconds?: number | null }> };
          return { ...row, songs: (detail.songs ?? []).map(normalizeSong) };
        }));
        if (current === requestId.current) { setArchive(details); setArchiveReady(true); }
      } catch { if (current === requestId.current) setArchiveError("過去のセトリを読み込めませんでした。再読み込みしてください。"); }
    })();
  }, []);

  const historyKeys = useMemo(() => archiveIdentitySet(archive), [archive]);
  const localSetlists = useMemo(() => store.events.filter((event) => event.status === "attended" && event.performances.length).map((event) => eventToArchiveSetlist(event, store.songs) as ArchiveSetlist), [store]);
  const allSetlists = useMemo(() => [...archive, ...localSetlists].sort((a, b) => b.date.localeCompare(a.date)), [archive, localSetlists]);
  const reminders = useMemo(() => getReminders(store) as Array<{ id: string; eventId: string; kind: string; message: string }>, [store]);
  const today = localDateString();
  const upcoming = useMemo(() => getUpcomingEvents(store, today) as LiveEvent[], [store, today]);
  const candidates = useMemo(() => store.songs.filter((song) => song.playlistStatus === "candidate"), [store.songs]);

  const songRanking = useMemo(() => buildSongRanking(allSetlists) as Array<{ title: string; artist: string; count: number }>, [allSetlists]);
  const artistRanking = useMemo(() => buildArtistRanking(allSetlists) as Array<{ artist: string; count: number }>, [allSetlists]);
  const chart = useMemo(() => {
    const total = artistRanking.reduce((sum, entry) => sum + entry.count, 0); const colors = ["#d9724c", "#f2b177", "#efc9a2", "#d6b38f", "#a78a6d", "#e7ddd2"];
    const rows = artistRanking.slice(0, 6).map((entry, index) => ({ ...entry, color: colors[index], percentage: total ? entry.count / total * 100 : 0 }));
    const rest = total - rows.reduce((sum, entry) => sum + entry.count, 0); if (rest) rows.push({ artist: "その他", count: rest, color: colors[5], percentage: rest / total * 100 }); return rows;
  }, [artistRanking]);
  const chartBackground = useMemo(() => `conic-gradient(${chart.map((entry, index) => { const start = chart.slice(0, index).reduce((sum, item) => sum + item.percentage, 0); return `${entry.color} ${start}% ${start + entry.percentage}%`; }).join(", ") || "#f4efe9 0 100%"})`, [chart]);

  const modal = allSetlists.find((setlist) => setlist.id === modalId) ?? null;
  const modalArtists = useMemo(() => { const groups = new Map<string, Song[]>(); modal?.songs.forEach((song) => groups.set(song.artist, [...(groups.get(song.artist) ?? []), song])); return [...groups].map(([artist, songs]) => ({ artist, songs })); }, [modal]);
  const activeArtist = selectedArtist && modalArtists.some((group) => group.artist === selectedArtist) ? selectedArtist : modalArtists[0]?.artist ?? null;
  const closeModal = () => { setModalId(null); window.setTimeout(() => dialogTriggerRef.current?.focus(), 0); };
  useEffect(() => { if (!modal) return; closeRef.current?.focus(); const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") closeModal(); if (event.key !== "Tab") return; const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]; if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [modal]);

  const saveEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const now = new Date().toISOString(); const id = draft.id || createId("event"); const old = store.events.find((item) => item.id === id);
    const lotteryRounds: LotteryRound[] = draft.applicationDate || draft.resultDate || draft.ticketType || draft.lotteryMemo ? [{ id: old?.lotteryRounds[0]?.id ?? createId("lottery"), applicationDate: draft.applicationDate, resultDate: draft.resultDate, result: draft.lotteryResult, ticketType: draft.ticketType, memo: draft.lotteryMemo }] : [];
    const status: EventStatus = draft.lotteryResult === "lost" ? "lost" : draft.lotteryResult === "won" && ["applied", "waiting_result"].includes(draft.status) ? "confirmed" : draft.status;
    const next: LiveEvent = { id, title: draft.title.trim(), date: draft.date, venue: draft.venue.trim(), url: draft.url.trim(), memo: draft.memo.trim(), status, artists: draft.artistsText.split(/[、,\n]/).map((value) => value.trim()).filter(Boolean), lotteryRounds, performances: old?.performances ?? [], needsPostEventReview: status === "attended" ? old?.needsPostEventReview ?? true : false, reviewCompletedAt: old?.reviewCompletedAt ?? null, createdAt: old?.createdAt ?? now, updatedAt: now };
    setStore((current) => ({ ...current, events: [...current.events.filter((item) => item.id !== id), next] })); setDraft(emptyDraft()); setShowForm(false); setNotice("ライブ情報をこの端末に保存しました。");
  };
  const editEvent = (event: LiveEvent) => { setDraft(toDraft(event)); setShowForm(true); setTab("lives"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const reviewEvent = (eventId: string) => { setStore((current) => ({ ...current, events: current.events.map((event) => event.id === eventId ? { ...event, status: "attended", needsPostEventReview: true, updatedAt: new Date().toISOString() } : event) })); setSetlistEventId(eventId); setTab("setlists"); };
  const saveSetlist = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!archiveReady) { setNotice("過去データの読み込み後にセトリを保存してください。"); return; } const titles = setlistText.split("\n").map((value) => value.replace(/^\s*\d+[.)、]?\s*/, "").trim()).filter(Boolean); setStore((current) => upsertPerformance(current, setlistEventId, setlistArtist, titles, historyKeys) as PlannerStore); setSetlistArtist(""); setSetlistText(""); setNotice("セトリを保存し、集計とプレイリスト候補を更新しました。"); };
  const navigation = [["home", "ホーム"], ["lives", "ライブ管理"], ["setlists", "セトリ"], ["playlist", `追加候補${candidates.length ? ` ${candidates.length}` : ""}`], ["dashboard", "集計"]] as const;

  return <main className="setlist-page">
    <nav className="main-tab-bar" aria-label="メイン画面">{navigation.map(([key, label]) => <button key={key} type="button" className={tab === key ? "tab-button active" : "tab-button"} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {notice && <div className="inline-notice" role="status">{notice}</div>}

    {tab === "home" && <section className="workspace-page" aria-labelledby="home-title">
      <header className="page-heading"><p className="eyebrow">Live planner</p><h1 id="home-title">次のライブと、終わった後の記録</h1><p>予定・抽選・参戦後の更新を、この端末内でまとめて管理します。</p></header>
      <section className="action-section"><div className="section-header"><div><p className="eyebrow">Needs action</p><h2>対応が必要</h2></div><span className="count-label">{reminders.length}件</span></div>{reminders.length === 0 ? <p className="empty-state">今すぐ対応する記録はありません。</p> : <ul className="action-list">{reminders.map((reminder) => <li key={reminder.id}><span>{reminder.message}</span><button type="button" className="secondary-button" onClick={() => reminder.kind === "lottery" ? editEvent(store.events.find((item) => item.id === reminder.eventId)!) : reviewEvent(reminder.eventId)}>{reminder.kind === "lottery" ? "結果を入力" : "記録を更新"}</button></li>)}</ul>}</section>
      <div className="home-columns"><section className="summary-section"><div className="section-header"><div><p className="eyebrow">Upcoming</p><h2>これからのライブ</h2></div><button type="button" className="text-button" onClick={() => { setDraft(emptyDraft()); setShowForm(true); setTab("lives"); }}>登録する</button></div>{upcoming.length === 0 ? <p className="empty-state">参戦予定・抽選中のライブはありません。</p> : <ul className="compact-event-list">{upcoming.slice(0, 4).map((event) => <li key={event.id}><time dateTime={event.date}>{displayDate(event.date)}</time><strong>{event.title}</strong><span className={`status-badge ${tone(event.status)}`}>{EVENT_STATUS_LABELS[event.status]}</span></li>)}</ul>}</section><section className="summary-section"><p className="eyebrow">Playlist candidates</p><h2>プレイリスト追加候補</h2><p className="candidate-count"><strong>{candidates.length}</strong><span>曲が未処理です</span></p><button type="button" className="secondary-button" onClick={() => setTab("playlist")}>候補を確認</button></section></div>
    </section>}

    {tab === "lives" && <section className="workspace-page" aria-labelledby="lives-title">
      <header className="page-heading page-heading-action"><div><p className="eyebrow">Upcoming & lottery</p><h1 id="lives-title">ライブ管理</h1><p>予定と抽選状況を登録し、終演後の記録につなげます。</p></div><button type="button" className="primary-button" onClick={() => { if (!showForm) setDraft(emptyDraft()); setShowForm(!showForm); }}>{showForm ? "フォームを閉じる" : "ライブを登録"}</button></header>
      {showForm && <form className="editor-form" onSubmit={saveEvent}><div className="form-section"><h2>基本情報</h2><div className="form-grid">
        <label className="field field-wide"><span>ライブ / フェス名 *</span><input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="field"><span>公演日 *</span><input required type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label><label className="field"><span>参加ステータス *</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as EventStatus })}>{(EVENT_STATUSES as EventStatus[]).map((status) => <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>)}</select></label>
        <label className="field"><span>会場</span><input value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} /></label><label className="field"><span>URL</span><input type="url" inputMode="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
        <label className="field field-wide"><span>出演アーティスト</span><input value={draft.artistsText} onChange={(e) => setDraft({ ...draft, artistsText: e.target.value })} /><small>複数の場合は「、」またはカンマで区切ります。</small></label><label className="field field-wide"><span>メモ</span><textarea rows={3} value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} /></label>
      </div></div><details className="form-details" open={["applied", "waiting_result"].includes(draft.status)}><summary>抽選情報</summary><div className="form-grid details-grid">
        <label className="field"><span>申込日</span><input type="date" value={draft.applicationDate} onChange={(e) => setDraft({ ...draft, applicationDate: e.target.value })} /></label><label className="field"><span>結果発表日</span><input type="date" value={draft.resultDate} onChange={(e) => setDraft({ ...draft, resultDate: e.target.value })} /></label>
        <label className="field"><span>当落</span><select value={draft.lotteryResult} onChange={(e) => setDraft({ ...draft, lotteryResult: e.target.value as EventDraft["lotteryResult"] })}><option value="pending">結果待ち</option><option value="won">当選</option><option value="lost">落選</option></select></label><label className="field"><span>チケット種別</span><input value={draft.ticketType} onChange={(e) => setDraft({ ...draft, ticketType: e.target.value })} /></label><label className="field field-wide"><span>抽選メモ</span><textarea rows={2} value={draft.lotteryMemo} onChange={(e) => setDraft({ ...draft, lotteryMemo: e.target.value })} /></label>
      </div></details><div className="form-actions"><button type="button" className="secondary-button" onClick={() => { setShowForm(false); setDraft(emptyDraft()); }}>キャンセル</button><button type="submit" className="primary-button">{draft.id ? "変更を保存" : "ライブを保存"}</button></div></form>}
      <div className="managed-event-list">{store.events.length === 0 ? <p className="empty-state">まだ管理中のライブはありません。「ライブを登録」から追加できます。</p> : store.events.slice().sort((a, b) => b.date.localeCompare(a.date)).map((event) => <article className="managed-event-row" key={event.id}><div className="event-date-block"><time dateTime={event.date}>{displayDate(event.date)}</time><span className={`status-badge ${tone(event.status)}`}>{EVENT_STATUS_LABELS[event.status]}</span></div><div className="event-copy"><h2>{event.title}</h2><p>{event.venue || "会場未登録"}{event.artists.length ? ` · ${event.artists.join(" / ")}` : ""}</p></div><div className="row-actions"><button type="button" className="secondary-button" onClick={() => editEvent(event)}>編集</button>{event.date < today && !["lost", "cancelled"].includes(event.status) && <button type="button" className="primary-button" onClick={() => reviewEvent(event.id)}>参戦記録</button>}</div></article>)}</div>
    </section>}

    {tab === "setlists" && <section className="workspace-page" aria-labelledby="setlists-title"><header className="page-heading"><p className="eyebrow">Setlist archive</p><h1 id="setlists-title">セトリ</h1><p>参戦した公演のアーティスト別セットリストを追加し、過去記録と一緒に振り返ります。</p></header>
      <form className="editor-form compact-editor" onSubmit={saveSetlist}><div className="section-header"><div><p className="eyebrow">Post event review</p><h2>参戦後のセトリ登録</h2></div></div><div className="form-grid"><label className="field"><span>ライブ *</span><select required value={setlistEventId} onChange={(e) => setSetlistEventId(e.target.value)}><option value="">選択してください</option>{store.events.filter((event) => !["lost", "cancelled"].includes(event.status)).sort((a, b) => b.date.localeCompare(a.date)).map((event) => <option key={event.id} value={event.id}>{displayDate(event.date)} {event.title}</option>)}</select></label><label className="field"><span>見たアーティスト *</span><input required value={setlistArtist} onChange={(e) => setSetlistArtist(e.target.value)} /></label><label className="field field-wide"><span>曲順 *</span><textarea required rows={7} placeholder={'1曲につき1行\n曲名 A\n曲名 B'} value={setlistText} onChange={(e) => setSetlistText(e.target.value)} /><small>同じアーティストを再登録すると、そのアーティストの曲順を置き換えます。</small></label></div><div className="form-actions"><button type="submit" className="primary-button" disabled={!archiveReady}>{archiveReady ? "セトリを保存" : "過去データを読み込み中"}</button></div></form>
      {archiveError && <p className="error-state" role="alert">{archiveError}</p>}<div className="archive-list event-list">{allSetlists.length === 0 ? <p className="empty-state">セトリはまだありません。</p> : allSetlists.map((setlist) => <button key={`${setlist.source}-${setlist.id}`} type="button" className="archive-item event-card" onClick={(event) => { dialogTriggerRef.current = event.currentTarget; setModalId(setlist.id); setSelectedArtist(null); }}><span className="archive-date">{displayDate(setlist.date)}</span><span className="archive-tag">{setlist.source === "local" ? "端末で登録" : "Archive"}</span><strong>{setlist.title}</strong><small>{setlist.songs.length}曲</small></button>)}</div>
    </section>}

    {tab === "playlist" && <section className="workspace-page" aria-labelledby="playlist-title"><header className="page-heading"><p className="eyebrow">YouTube Music checklist</p><h1 id="playlist-title">プレイリスト追加候補</h1><p>初登場曲は「追加候補」、過去ライブで聴いていてYouTube Musicの登録状況が分からない曲は「未確認」です。自動連携は行いません。</p></header><div className="playlist-filter-summary">未処理 <strong>{candidates.length}曲</strong> / 管理対象 {store.songs.length}曲</div>{store.songs.length === 0 ? <p className="empty-state">候補はまだありません。新しいセトリを登録すると、初登場曲がここに表示されます。</p> : <ul className="playlist-list">{store.songs.slice().sort((a, b) => Number(a.playlistStatus !== "candidate") - Number(b.playlistStatus !== "candidate") || b.createdAt.localeCompare(a.createdAt)).map((song) => <li key={song.id} className="playlist-row"><div><strong>{song.displayTitle}</strong><span>{song.displayArtist}</span><small>{song.firstHeardEventId ? "このアプリの記録で初登場" : "過去ライブで記録あり・YouTube Music登録状況は未確認"}</small></div><fieldset><legend className="sr-only">{song.displayTitle}のプレイリスト状態</legend>{(PLAYLIST_STATUSES as PlaylistStatus[]).map((status) => <button key={status} type="button" className={song.playlistStatus === status ? "status-choice active" : "status-choice"} aria-pressed={song.playlistStatus === status} onClick={() => setStore((current) => updatePlaylistStatus(current, song.id, status) as PlannerStore)}>{PLAYLIST_STATUS_LABELS[status]}</button>)}</fieldset></li>)}</ul>}</section>}

    {tab === "dashboard" && <section className="dashboard-page" aria-labelledby="dashboard-title"><header className="page-heading"><p className="eyebrow">Dashboard</p><h1 id="dashboard-title">ライブ履歴の集計</h1><p>Archiveとこの端末で登録した参戦記録を合算しています。</p></header><section className="dashboard-section"><div className="section-header dashboard-header-row"><div><h2>よく聴いている曲</h2><p>同じ正規化アーティスト名・曲名の登場回数</p></div><div className="select-inline" aria-label="表示件数">{[10, 20, 50].map((value) => <button key={value} type="button" className={rankLimit === value ? "mini-button active" : "mini-button"} onClick={() => setRankLimit(value)}>{value}</button>)}</div></div><ol className="song-ranking-list">{songRanking.slice(0, rankLimit).map((entry, index) => <li key={`${entry.artist}:${entry.title}`} className="song-ranking-row"><span className="ranking-rank">#{index + 1}</span><div className="ranking-song-meta"><strong>{entry.title}</strong><small>{entry.artist}</small></div><span className="ranking-count">{entry.count}回</span></li>)}</ol></section><section className="dashboard-section"><div className="section-header"><div><h2>よく観ているアーティスト</h2><p>アーティストが登場した公演数の構成比</p></div></div><div className="artist-composition-shell"><div className="donut-chart-wrap"><div className="donut-chart" style={{ background: chartBackground }} role="img" aria-label={chart.map((entry) => `${entry.artist} ${entry.count}公演`).join("、")}><div className="donut-center"><span>延べ公演</span><strong>{artistRanking.reduce((sum, entry) => sum + entry.count, 0)}</strong></div></div></div><ol className="chart-label-list">{chart.map((entry) => <li key={entry.artist} className="chart-label-item"><span className="leader-line" style={{ backgroundColor: entry.color }} aria-hidden="true" /><span className="chart-label-name">{entry.artist}</span><span>{entry.count}公演</span><span>{entry.percentage.toFixed(1)}%</span></li>)}</ol></div></section></section>}

    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><section ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="setlist-dialog-title"><div className="modal-header"><div><p className="eyebrow">Setlist detail</p><h2 id="setlist-dialog-title">{modal.title}</h2></div><button ref={closeRef} type="button" className="close-button" aria-label="セトリ詳細を閉じる" onClick={closeModal}>×</button></div><dl className="modal-meta-grid"><div><dt>開催日</dt><dd>{displayDate(modal.date)}</dd></div><div><dt>会場</dt><dd>{modal.venue || "—"}</dd></div><div><dt>曲数</dt><dd>{modal.songs.length}曲</dd></div></dl><div className="artist-select-list">{modalArtists.map((group) => <button key={group.artist} type="button" className={activeArtist === group.artist ? "artist-chip active" : "artist-chip"} onClick={() => setSelectedArtist(group.artist)}>{group.artist}</button>)}</div>{activeArtist && <div className="artist-detail-panel"><h3>{activeArtist}</h3><ol className="artist-song-list">{modalArtists.find((group) => group.artist === activeArtist)?.songs.map((song, index) => <li key={`${song.id}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{song.title}</strong><small>{song.duration}</small></li>)}</ol></div>}{modal.songs.length > 0 && <p className="modal-runtime">収録曲の合計時間: {formatDuration(modal.songs.reduce((sum, song) => sum + parseDuration(song.duration), 0))}</p>}</section></div>}
  </main>;
}
