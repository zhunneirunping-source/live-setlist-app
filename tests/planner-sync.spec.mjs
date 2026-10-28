import { expect, test } from "@playwright/test";

test.beforeEach(async ({ baseURL }) => {
  if (process.env.PLANNER_TEST_MODE !== "1" || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Sync tests require an isolated local server with PLANNER_TEST_MODE=1");
});

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
  const blocked = await request.post("/api/planner", { data: { store: probe } });
  expect(blocked.status()).toBe(405);
  const after = await (await request.get("/api/planner")).json();
  expect(after.store).toEqual(initial.store);
});
