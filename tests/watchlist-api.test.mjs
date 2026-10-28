import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createWatchStore, saveWatchTarget } from "../lib/watchlist.js";

// Execute the actual route SQL against isolated SQLite; only the D1 transport is adapted.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../drizzle/0001_cloud_planner.sql", import.meta.url), "utf8"));
sqlite.exec("INSERT INTO planner_state VALUES (1, '{\"preserved\":true}', 31, 'baseline', 'test')");
const baseline = sqlite.prepare("SELECT * FROM planner_state").get();
const migration = readFileSync(new URL("../drizzle/0002_culture_watchlist.sql", import.meta.url), "utf8");
sqlite.exec(migration); sqlite.exec(migration);
globalThis.__watchTestDB = { prepare(sql) {
  const stmt = sqlite.prepare(sql);
  let args = {};
  return { bind(...values) { args = Object.fromEntries(values.map((value, index) => [String(index + 1), value])); return this; },
    async first() { return stmt.get(args) ?? null; }, async run() { return { meta: { changes: Number(stmt.run(args).changes) } }; } };
} };
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = { DB: globalThis.__watchTestDB };", shortCircuit: true };
  return next(specifier, context);
} });
const { GET, PUT } = await import("../app/api/watchlist/route.ts");
const request = (store, revision, url = "http://localhost/api/watchlist") => new Request(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ store, revision }) });

test("watch API authenticates, validates, persists, conflicts and preserves Planner", async () => {
  assert.equal((await GET(new Request("https://example.test/api/watchlist"))).status, 401);
  assert.equal((await PUT(request(createWatchStore(), 0, "https://example.test/api/watchlist"))).status, 401);
  const initial = await GET(new Request("http://localhost/api/watchlist"));
  assert.match(initial.headers.get("cache-control"), /no-store/);
  assert.equal((await initial.json()).revision, 0);
  let store = saveWatchTarget(createWatchStore(), { name: "Dummy", genre: "music", priority: "important" });
  assert.equal((await PUT(request(store, 0))).status, 200);
  assert.equal((await PUT(request(createWatchStore(), 0))).status, 409);
  store = saveWatchTarget(store, { ...store.targets[0], name: "Updated" });
  const [a, b] = await Promise.all([PUT(request(store, 1)), PUT(request(createWatchStore(), 1))]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const current = await (await GET(new Request("http://localhost/api/watchlist"))).json();
  assert.equal(current.revision, 2);
  assert.equal(current.store.targets[0].name, "Updated");
  assert.equal((await PUT(request({ ...store, targets: [...store.targets, store.targets[0]] }, 2))).status, 400);
  assert.equal((await PUT(request(store, -1))).status, 400);
  assert.equal((await PUT(request(store, Number.MAX_SAFE_INTEGER))).status, 400);
  assert.equal((await PUT(new Request("http://localhost/api/watchlist", { method: "PUT", body: "{}" }))).status, 400);
  assert.equal((await PUT(new Request("http://localhost/api/watchlist", { method: "PUT", headers: { "content-type": "application/json" }, body: '"' + "あ".repeat(350000) + '"' }))).status, 413);
  assert.equal((await PUT(request(createWatchStore(), 2))).status, 200);
  assert.equal((await (await GET(new Request("http://localhost/api/watchlist"))).json()).store.targets.length, 0);
  sqlite.exec("UPDATE watchlist_state SET document = '{\"version\":999,\"targets\":[]}'");
  assert.equal((await PUT(request(store, 3))).status, 500);
  assert.equal((await GET(new Request("http://localhost/api/watchlist"))).status, 503);
  assert.deepEqual(sqlite.prepare("SELECT * FROM planner_state").get(), baseline);
  hooks.deregister(); sqlite.close(); delete globalThis.__watchTestDB;
});
