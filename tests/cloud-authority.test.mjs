import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/planner/route.ts";
import { comparePlanner } from "../scripts/compare-planner.mjs";
import { createPlannerStore } from "../lib/live-planner.js";

test("all legacy import modes are rejected without accessing the database", async () => {
  for (const mode of [undefined, "reviewed_merge"]) {
    const response = await POST(new Request("http://localhost/api/planner", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, store: { version: 2, events: [], songs: [] }, revision: 0 }),
    }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, PUT");
  }
});

test("read-only comparison separates cloud-only, local-only and changed fields", () => {
  const base = createPlannerStore();
  const event = (id, title = id) => ({ id, title, date: "2026-10-28", status: "confirmed", performances: [] });
  const cloud = { ...base, events: [event("same", "Corrected"), event("cloud-only")] };
  const local = { ...base, events: [event("same", "Old"), event("phone-only")] };
  const raw = JSON.stringify(local);
  const report = comparePlanner(JSON.stringify({ store: cloud, revision: 7 }), raw);
  assert.deepEqual(report.events.cloudOnly.map(row => row.id), ["cloud-only"]);
  assert.deepEqual(report.events.localOnly.map(row => row.id), ["phone-only"]);
  assert.deepEqual(report.events.different[0].fields, ["title"]);
  assert.equal(report.legacyConflictCount, 1);
  assert.equal(JSON.stringify(local), raw);
  assert.throws(() => comparePlanner("{}", raw));
});
