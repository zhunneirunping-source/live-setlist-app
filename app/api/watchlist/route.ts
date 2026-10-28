import { database, authorize } from "../../../lib/cloud-database.js";
import { createWatchStore, validateWatchStore } from "../../../lib/watchlist.js";

type Row = { document: string; revision: number; updated_at: string };
const headers = { "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function readState(db: D1Database) {
  const row = await db.prepare("SELECT document, revision, updated_at FROM watchlist_state WHERE id = 1").first<Row>();
  if (!row) return { store: createWatchStore(), revision: 0, updatedAt: null };
  try { return { store: validateWatchStore(JSON.parse(row.document)), revision: row.revision, updatedAt: row.updated_at }; }
  catch { throw new Error("Invalid stored watchlist"); }
}

async function readBody(request: Request) {
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") throw new TypeError();
  const limit = 1_048_576;
  if (Number(request.headers.get("content-length")) > limit) throw new RangeError();
  if (!request.body) throw new TypeError();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new RangeError(); }
    text += decoder.decode(value, { stream: true });
  }
  const body = JSON.parse(text + decoder.decode());
  if (!Number.isSafeInteger(body?.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER) throw new TypeError();
  validateWatchStore(body.store);
  return body;
}

export async function GET(request: Request) {
  if (!authorize(request)) return json({ error: "Authentication required" }, 401);
  try { return json(await readState(await database())); }
  catch { return json({ error: "ウォッチリストを読み込めません。" }, 503); }
}

export async function PUT(request: Request) {
  const user = authorize(request);
  if (!user) return json({ error: "Authentication required" }, 401);
  try {
    const { store, revision } = await readBody(request);
    const db = await database();
    await readState(db); // Do not overwrite an invalid or newer stored schema.
    const updatedAt = new Date().toISOString();
    const result = await db.prepare("INSERT INTO watchlist_state (id, document, revision, updated_at, updated_by) SELECT 1, ?1, 1, ?2, ?3 WHERE ?4 = 0 ON CONFLICT(id) DO NOTHING")
      .bind(JSON.stringify(store), updatedAt, user, revision).run();
    if (result.meta.changes) return json({ store, revision: 1, updatedAt });
    const update = await db.prepare("UPDATE watchlist_state SET document = ?1, revision = ?2, updated_at = ?3, updated_by = ?4 WHERE id = 1 AND revision = ?5")
      .bind(JSON.stringify(store), revision + 1, updatedAt, user, revision).run();
    if (!update.meta.changes) return json({ error: "別の端末で更新されました。", ...await readState(db) }, 409);
    return json({ store, revision: revision + 1, updatedAt });
  } catch (error) {
    if (error instanceof RangeError) return json({ error: "データが大きすぎます。" }, 413);
    if (error instanceof TypeError || error instanceof SyntaxError) return json({ error: "入力内容を確認してください。" }, 400);
    return json({ error: "Cloudへ保存できません。" }, 500);
  }
}
