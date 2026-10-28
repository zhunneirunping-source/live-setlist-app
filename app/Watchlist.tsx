'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { WATCH_GENRES, WATCH_PRIORITIES, createWatchStore, validateWatchStore, saveWatchTarget, watchCandidates, addWatchCandidates } from "../lib/watchlist.js";

type Genre = keyof typeof WATCH_GENRES;
type Priority = keyof typeof WATCH_PRIORITIES;
type Target = { id: string; name: string; genre: Genre; priority: Priority; createdAt: string; updatedAt: string };
type Store = { version: number; targets: Target[] };
type Props = { planner: { events: Array<{ status: string; performances: Array<{ artistName: string }> }> }; archive: Array<{ songs: Array<{ artist: string }> }>; historyReady: boolean };
const emptyDraft = () => ({ id: "", name: "", genre: "music" as Genre, priority: "normal" as Priority });

export function Watchlist({ planner, archive, historyReady }: Props) {
  const [store, setStore] = useState<Store>(createWatchStore);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Genre | "all">("all");
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [removeId, setRemoveId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("normal");
  const nameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const returnToAdd = useRef(false);
  const listRef = useRef<HTMLHeadingElement>(null);
  const candidates = useMemo(() => watchCandidates(planner, archive, store) as string[], [planner, archive, store]);
  const rows = store.targets.filter(row => filter === "all" || row.genre === filter).sort((a, b) => Number(b.priority === "important") - Number(a.priority === "important") || a.name.localeCompare(b.name, "ja"));
  useEffect(() => { if (editing) nameRef.current?.focus(); }, [editing, draft.id]);
  useEffect(() => {
    if (!editing && !saving && returnToAdd.current) { addRef.current?.focus(); returnToAdd.current = false; }
  }, [editing, saving]);

  const accept = (data: { store: Store; revision: number }) => {
    validateWatchStore(data.store);
    if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error();
    setStore(data.store); setRevision(data.revision); setReady(true);
  };
  const reload = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      if (!response.ok) throw new Error();
      accept(await response.json());
    } catch { setReady(false); setError("ウォッチリストを読み込めません。接続を確認して再読み込みしてください。"); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/watchlist", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json() as { store: Store; revision: number };
      if (!cancelled) accept(data);
    }).catch(() => { if (!cancelled) setError("ウォッチリストを読み込めません。接続を確認して再読み込みしてください。"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async (next: Store, message: string) => {
    if (!ready || busy.current) return false;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try {
      validateWatchStore(next);
      const response = await fetch("/api/watchlist", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ store: next, revision }) });
      const data = await response.json() as { store: Store; revision: number };
      if (response.status === 409) {
        accept(data); setSelected([]); setRemoveId("");
        setError("別の端末で更新されました。最新の一覧を確認して、もう一度操作してください。"); return false;
      }
      if (!response.ok) throw new Error();
      accept(data); setNotice(message); return true;
    } catch { setError("Cloudへ保存できませんでした。入力を保持しています。再試行してください。"); return false; }
    finally { busy.current = false; setSaving(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (await save(saveWatchTarget(store, draft) as Store, "ウォッチ対象を保存しました。")) {
        returnToAdd.current = true; setEditing(false); setDraft(emptyDraft());
      }
    } catch (error) { setError(error instanceof Error ? error.message : "入力を確認してください。"); }
  };
  const registerCandidates = async () => {
    try {
      const next = addWatchCandidates(store, selected, candidates, priority) as Store;
      const count = next.targets.length - store.targets.length;
      if (count && await save(next, `${count}件のウォッチ対象を登録しました。`)) { setSelected([]); listRef.current?.focus(); }
    } catch { setError("対象数の上限（2000件）または名前を確認してください。"); }
  };
  const disabled = !ready || saving;

  return <section className="workspace-page watchlist-page" aria-labelledby="watch-title">
    <header className="page-heading page-heading-action"><h1 id="watch-title">ウォッチリスト</h1><button ref={addRef} type="button" className="primary-button" disabled={disabled} onClick={() => { setDraft(emptyDraft()); setEditing(true); setError(""); }}>対象を追加</button></header>
    <p>好きな対象を登録して管理します。情報の自動収集・通知はまだ行いません。</p>
    {loading && <p role="status">Cloudから読み込み中…</p>}
    {error && <p className="error-state" role="alert">{error}</p>}
    {!ready && !loading && <button className="secondary-button" type="button" onClick={() => void reload()}>再読み込み</button>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}
    {editing && <form className="editor-form" onSubmit={submit}>
      <h2>{draft.id ? "対象を編集" : "対象を追加"}</h2><fieldset disabled={disabled} className="watch-fields"><div className="form-grid">
        <label className="field field-wide"><span>名前 *</span><input ref={nameRef} required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="field"><span>ジャンル</span><select disabled={Boolean(draft.id)} value={draft.genre} onChange={e => setDraft({ ...draft, genre: e.target.value as Genre })}>{Object.entries(WATCH_GENRES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field"><span>重要度</span><select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as Priority })}>{Object.entries(WATCH_PRIORITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div><div className="form-actions"><button className="primary-button" type="submit">{saving ? "保存中…" : "保存"}</button><button className="secondary-button" type="button" onClick={() => { setEditing(false); addRef.current?.focus(); }}>キャンセル</button></div></fieldset>
    </form>}
    <section className="summary-section" aria-labelledby="watch-list-title">
      <div className="section-header"><h2 id="watch-list-title" ref={listRef} tabIndex={-1}>登録対象（{rows.length}件）</h2><label className="field"><span>ジャンルで絞り込み</span><select value={filter} onChange={e => setFilter(e.target.value as Genre | "all")}><option value="all">すべて</option>{Object.entries(WATCH_GENRES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      {ready && rows.length === 0 && <p className="empty-state">{store.targets.length ? "このジャンルの登録はありません。" : "ウォッチ対象はまだありません。対象を追加するか、参戦履歴から選んでください。"}</p>}
      <ul className="watch-rows">{rows.map(row => <li key={row.id}>
        <div><strong>{row.name}</strong><p>{WATCH_GENRES[row.genre]} · {WATCH_PRIORITIES[row.priority]}</p></div>
        <div className="row-actions"><button className="secondary-button" type="button" disabled={disabled} aria-label={`${row.name}を編集`} onClick={() => { setDraft(row); setEditing(true); setError(""); nameRef.current?.focus(); }}>編集</button><button className="text-button" type="button" disabled={disabled} aria-label={`${row.name}のウォッチ解除`} onClick={() => setRemoveId(row.id)}>ウォッチ解除</button></div>
        {removeId === row.id && <div className="watch-confirm"><p>「{row.name}」のウォッチを解除しますか？</p><div className="row-actions"><button className="secondary-button" type="button" disabled={disabled} onClick={() => void save({ ...store, targets: store.targets.filter(target => target.id !== row.id) }, "ウォッチを解除しました。").then(saved => { if (saved) { setRemoveId(""); listRef.current?.focus(); } })}>解除する</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setRemoveId("")}>キャンセル</button></div></div>}
      </li>)}</ul>
    </section>
    <details className="summary-section watch-history"><summary>ライブ参戦履歴から登録</summary><p>実演記録のあるアーティストが候補です。選択した対象だけをライブ・音楽に登録します。</p>
      {!historyReady ? <p role="status">候補の取得に必要な参戦履歴を読み込めていません。画面を再読み込みしてください。</p> : candidates.length === 0 ? <p className="empty-state">未登録の候補はありません。</p> : <fieldset disabled={disabled} className="watch-fields"><legend>登録するアーティストを選択</legend><div className="watch-candidates">{candidates.map(name => <label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={e => setSelected(current => e.target.checked ? [...current, name] : current.filter(item => item !== name))} /><span>{name}</span></label>)}</div>
        <label className="field"><span>候補の重要度</span><select value={priority} onChange={e => setPriority(e.target.value as Priority)}>{Object.entries(WATCH_PRIORITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button type="button" className="primary-button" disabled={!selected.some(name => candidates.includes(name))} onClick={() => void registerCandidates()}>選択した候補を登録</button>
      </fieldset>}
    </details>
  </section>;
}
