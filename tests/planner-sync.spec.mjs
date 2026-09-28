import { expect, test } from "@playwright/test";
import { plannerMigrationKey } from "../lib/live-planner.js";

test("cloud planner detects a stale cross-device revision", async ({ request }) => {
  const initialResponse = await request.get("/api/planner");
  expect(initialResponse.ok()).toBeTruthy();
  const initial = await initialResponse.json();
  const now = new Date().toISOString();
  const probe = {
    ...initial.store,
    events: [...initial.store.events, {
      id: "e2e-sync-probe",
      title: "Sync Probe",
      date: "2099-01-01",
      venue: "Test Venue",
      eventType: "one_man",
      url: "",
      memo: "",
      status: "interested",
      artists: [],
      lotteryRounds: [],
      performances: [],
      needsPostEventReview: false,
      reviewCompletedAt: null,
      createdAt: now,
      updatedAt: now,
    }],
  };

  const first = await request.put("/api/planner", { data: { store: probe, revision: initial.revision } });
  expect(first.ok()).toBeTruthy();
  const saved = await first.json();

  const stale = await request.put("/api/planner", { data: { store: probe, revision: initial.revision } });
  expect(stale.status()).toBe(409);
  const conflict = await stale.json();
  expect(conflict.revision).toBe(saved.revision);

  const restore = await request.put("/api/planner", { data: { store: initial.store, revision: saved.revision } });
  expect(restore.ok()).toBeTruthy();
  const restored = await restore.json();

  const migrationEvent = { ...probe.events.at(-1), id: `e2e-migration-${Date.now()}`, title: "Migration Review Probe" };
  const sourceStore = { ...initial.store, events: [...initial.store.events, migrationEvent] };
  const mergedStore = { ...restored.store, events: [...restored.store.events, migrationEvent] };
  const reviewedMerge = await request.post("/api/planner", { data: {
    mode: "reviewed_merge",
    store: mergedStore,
    sourceStore,
    migrationKey: plannerMigrationKey(sourceStore),
    revision: restored.revision,
  } });
  expect(reviewedMerge.ok()).toBeTruthy();
  const merged = await reviewedMerge.json();
  expect(merged.migrationRecorded).toBe(true);
  expect(merged.store.events.some((event) => event.id === migrationEvent.id)).toBe(true);

  const restoreAfterMerge = await request.put("/api/planner", { data: { store: initial.store, revision: merged.revision } });
  expect(restoreAfterMerge.ok()).toBeTruthy();
});
