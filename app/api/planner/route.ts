import {
  createPlannerStore,
  PLANNER_SCHEMA_VERSION,
  isPlannerStoreEmpty,
  loadPlannerStore,
} from "../../../lib/live-planner.js";

type PlannerRow = { document: string; revision: number; updated_at: string };
import { database, authorize } from "../../../lib/cloud-database.js";
const MAX_PLANNER_BODY_BYTES = 1_048_576;

function logPlannerFailure(event: string, error: unknown) {
  console.error(JSON.stringify({
    event,
    errorType: error instanceof Error ? error.name : "UnknownError",
  }));
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
  return JSON.parse(text) as { store?: unknown; revision?: number };
}

async function bodyStore(request: Request) {
  const body = await readPlannerBody(request);
  if (!body.store || typeof body.store !== "object" || (body.store as { version?: unknown }).version !== PLANNER_SCHEMA_VERSION) {
    throw new TypeError("Planner document is invalid");
  }
  const loaded = loadPlannerStore(JSON.stringify(body.store));
  if (loaded.recovered) throw new TypeError("Planner document is invalid");
  return { ...body, store: loaded.store };
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
  return Response.json({ error: "Browser migration is disabled; preserve and export local data for review" }, { status: 405, headers: { allow: "GET, PUT" } });
}

export async function PUT(request: Request) {
  const user = authorize(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { store, revision } = await bodyStore(request);
    const db = await database();
    if (!Number.isInteger(revision) || Number(revision) < 0) return Response.json({ error: "Revision is required" }, { status: 400 });
    await readState(db); // Never overwrite an unsupported or malformed stored document.
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
