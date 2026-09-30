import {
  createPlannerStore,
  isPlannerStoreEmpty,
  loadPlannerStore,
  plannerMigrationKey,
  plannerStoreCovers,
  plannerStorePreserves,
} from "../../../lib/live-planner.js";

type PlannerRow = { document: string; revision: number; updated_at: string };
type RuntimeEnv = { DB?: D1Database };
const MAX_PLANNER_BODY_BYTES = 1_048_576;

function logPlannerFailure(event: string, error: unknown) {
  console.error(JSON.stringify({
    event,
    errorType: error instanceof Error ? error.name : "UnknownError",
  }));
}

async function database() {
  const runtime = await import("cloudflare:workers") as { env?: RuntimeEnv };
  const db = runtime.env?.DB;
  if (!db) throw new Error("Planner database binding is unavailable");
  return db;
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function authenticatedUser(request: Request) {
  return request.headers.get("cf-access-authenticated-user-email")?.trim() || null;
}

function authorize(request: Request) {
  if (isLocalRequest(request)) return "local-development";
  return authenticatedUser(request);
}

async function readState(db: D1Database) {
  const row = await db.prepare("SELECT document, revision, updated_at FROM planner_state WHERE id = 1").first<PlannerRow>();
  if (!row) return { store: createPlannerStore(), revision: 0, updatedAt: null };
  const loaded = loadPlannerStore(row.document);
  if (loaded.recovered) throw new Error("Stored planner document is invalid");
  return { store: loaded.store, revision: row.revision, updatedAt: row.updated_at };
}

async function readPlannerBody(request: Request) {
  const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw new TypeError("Planner request must use application/json");
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PLANNER_BODY_BYTES) throw new RangeError("Planner request is too large");
  if (!request.body) throw new SyntaxError("Planner request body is required");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_PLANNER_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("Planner request is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text) as { store?: unknown; sourceStore?: unknown; revision?: number; migrationKey?: string; mode?: string };
}

async function bodyStore(request: Request) {
  const body = await readPlannerBody(request);
  if (!body.store || typeof body.store !== "object" || (body.store as { version?: unknown }).version !== 1) {
    throw new TypeError("Planner document is invalid");
  }
  const loaded = loadPlannerStore(JSON.stringify(body.store));
  if (loaded.recovered) throw new TypeError("Planner document is invalid");
  let sourceStore;
  if (body.sourceStore !== undefined) {
    if (!body.sourceStore || typeof body.sourceStore !== "object" || (body.sourceStore as { version?: unknown }).version !== 1) {
      throw new TypeError("Planner migration source is invalid");
    }
    const source = loadPlannerStore(JSON.stringify(body.sourceStore));
    if (source.recovered) throw new TypeError("Planner migration source is invalid");
    sourceStore = source.store;
  }
  return { ...body, store: loaded.store, sourceStore };
}

export async function GET(request: Request) {
  if (!authorize(request)) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const db = await database();
    const state = await readState(db);
    const migrationKey = new URL(request.url).searchParams.get("migrationKey");
    const migrationRecorded = migrationKey && migrationKey.length <= 160
      ? Boolean(await db.prepare("SELECT migration_key FROM planner_migrations WHERE migration_key = ?1").bind(migrationKey).first())
      : false;
    return Response.json({ ...state, empty: isPlannerStoreEmpty(state.store), migrationRecorded }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    logPlannerFailure("planner_read_failed", error);
    return Response.json({ error: "Planner data is unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = authorize(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { store, sourceStore, migrationKey, mode, revision } = await bodyStore(request);
    const db = await database();
    if (!migrationKey || migrationKey.length > 160) return Response.json({ error: "Migration key is required" }, { status: 400 });
    const prior = await db.prepare("SELECT migration_key FROM planner_migrations WHERE migration_key = ?1").bind(migrationKey).first();
    if (prior) return Response.json({ ...(await readState(db)), migrated: false, duplicate: true });
    const current = await readState(db);
    if (mode === "reviewed_merge") {
      if (!Number.isInteger(revision) || Number(revision) < 1) return Response.json({ error: "Revision is required" }, { status: 400 });
      if (Number(revision) !== current.revision) return Response.json({ error: "Planner changed on another device", ...current }, { status: 409 });
      if (!plannerStorePreserves(current.store, store)) return Response.json({ error: "Reviewed merge may not remove or overwrite Cloud data" }, { status: 400 });
      const recordMigration = Boolean(sourceStore && plannerMigrationKey(sourceStore) === migrationKey && plannerStoreCovers(sourceStore, store));
      const nextRevision = Number(revision) + 1;
      const updatedAt = new Date().toISOString();
      const statements = [
        db.prepare("UPDATE planner_state SET document = ?1, revision = ?2, updated_at = ?3, updated_by = ?4 WHERE id = 1 AND revision = ?5")
          .bind(JSON.stringify(store), nextRevision, updatedAt, user, revision),
      ];
      if (recordMigration) {
        statements.push(db.prepare("INSERT INTO planner_migrations (migration_key, imported_by, imported_at) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM planner_state WHERE id = 1 AND revision = ?4 AND updated_at = ?3 AND updated_by = ?2)")
          .bind(migrationKey, user, updatedAt, nextRevision));
      }
      const results = await db.batch(statements);
      if (!results[0].meta.changes) return Response.json({ error: "Planner changed on another device", ...(await readState(db)) }, { status: 409 });
      return Response.json({ store, revision: nextRevision, updatedAt, migrated: true, migrationRecorded: recordMigration });
    }
    if (!isPlannerStoreEmpty(current.store)) return Response.json({ error: "Cloud planner is not empty" }, { status: 409 });
    const updatedAt = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO planner_migrations (migration_key, imported_by, imported_at) VALUES (?1, ?2, ?3)").bind(migrationKey, user, updatedAt),
      db.prepare("INSERT INTO planner_state (id, document, revision, updated_at, updated_by) VALUES (1, ?1, 1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET document = excluded.document, revision = 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind(JSON.stringify(store), updatedAt, user),
    ]);
    return Response.json({ store, revision: 1, updatedAt, migrated: true });
  } catch (error) {
    logPlannerFailure("planner_import_failed", error);
    if (error instanceof RangeError) return Response.json({ error: "Planner request is too large" }, { status: 413 });
    if (error instanceof SyntaxError || error instanceof TypeError) return Response.json({ error: "Planner request is invalid" }, { status: 400 });
    return Response.json({ error: "Planner migration failed; local data was kept" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = authorize(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { store, revision } = await bodyStore(request);
    const db = await database();
    if (!Number.isInteger(revision) || Number(revision) < 0) return Response.json({ error: "Revision is required" }, { status: 400 });
    const nextRevision = Number(revision) + 1;
    const updatedAt = new Date().toISOString();
    const result = await db.prepare("UPDATE planner_state SET document = ?1, revision = ?2, updated_at = ?3, updated_by = ?4 WHERE id = 1 AND revision = ?5")
      .bind(JSON.stringify(store), nextRevision, updatedAt, user, revision).run();
    if (!result.meta.changes && revision === 0) {
      try {
        await db.prepare("INSERT INTO planner_state (id, document, revision, updated_at, updated_by) VALUES (1, ?1, 1, ?2, ?3)").bind(JSON.stringify(store), updatedAt, user).run();
        return Response.json({ store, revision: 1, updatedAt });
      } catch { /* another client won the create race */ }
    }
    if (!result.meta.changes) return Response.json({ error: "Planner changed on another device", ...(await readState(db)) }, { status: 409 });
    return Response.json({ store, revision: nextRevision, updatedAt });
  } catch (error) {
    logPlannerFailure("planner_write_failed", error);
    if (error instanceof RangeError) return Response.json({ error: "Planner request is too large" }, { status: 413 });
    if (error instanceof SyntaxError || error instanceof TypeError) return Response.json({ error: "Planner request is invalid" }, { status: 400 });
    return Response.json({ error: "Planner data could not be saved" }, { status: 500 });
  }
}
