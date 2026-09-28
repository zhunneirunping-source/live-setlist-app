import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveIdentitySet,
  buildArtistSongRanking,
  buildMonthlyAttendance,
  buildPlannerMigrationReview,
  createPlannerStore,
  getReminders,
  getUpcomingEvents,
  loadPlannerStore,
  normalizeIdentityText,
  mergePlannerMigrationCandidates,
  plannerMigrationKey,
  plannerStoreCovers,
  plannerStorePreserves,
  updatePlaylistStatus,
  upsertPerformance,
} from "../lib/live-planner.js";

function event(overrides = {}) {
  return {
    id: "event-1",
    title: "Sample Live",
    date: "2026-09-27",
    venue: "Venue",
    url: "",
    memo: "",
    status: "confirmed",
    artists: [],
    lotteryRounds: [],
    performances: [],
    needsPostEventReview: false,
    reviewCompletedAt: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

test("normalizes width, case, whitespace, and dash variants for song identity", () => {
  assert.equal(normalizeIdentityText(" １０−ＦＥＥＴ "), "10-feet");
  assert.equal(normalizeIdentityText("Song  TITLE"), "song title");
});

test("loads a versioned store and safely resets malformed or unsupported data", () => {
  const store = createPlannerStore("2026-09-28");
  assert.deepEqual(loadPlannerStore(JSON.stringify(store), "2026-09-28"), { store, recovered: false });
  assert.equal(loadPlannerStore("not json", "2026-09-28").recovered, true);
  assert.equal(loadPlannerStore('{"version":2}', "2026-09-28").store.trackingEnabledAt, "2026-09-28");
});

test("creates a stable idempotency key for the same local planner content", () => {
  const store = { ...createPlannerStore("2026-09-28"), events: [event()], songs: [] };
  assert.equal(plannerMigrationKey(store), plannerMigrationKey(JSON.parse(JSON.stringify(store))));
});

test("offers local-only events as reviewed additions without overwriting Cloud events", () => {
  const eventA = event({ id: "event-a", title: "Event A" });
  const eventB = event({ id: "event-b", title: "Event B" });
  const eventC = event({ id: "event-c", title: "Event C" });
  const cloud = { ...createPlannerStore("2026-09-01"), events: [eventA, eventB] };
  const local = { ...createPlannerStore("2026-09-01"), events: [eventA, eventC] };
  const review = buildPlannerMigrationReview(local, cloud);
  assert.deepEqual(review.safeEvents.map((row) => row.id), ["event-c"]);
  assert.equal(review.hasConflicts, false);

  const merged = mergePlannerMigrationCandidates(cloud, local).store;
  assert.deepEqual(merged.events.map((row) => row.id), ["event-a", "event-b", "event-c"]);
  assert.equal(plannerStorePreserves(cloud, merged), true);
  assert.equal(plannerStoreCovers(local, merged), true);
});

test("keeps same-ID changes as Human-review conflicts", () => {
  const cloudEvent = event({ id: "event-a", title: "Cloud title" });
  const localEvent = event({ id: "event-a", title: "Local title" });
  const cloud = { ...createPlannerStore("2026-09-01"), events: [cloudEvent] };
  const local = { ...createPlannerStore("2026-09-01"), events: [localEvent] };
  const review = buildPlannerMigrationReview(local, cloud);
  assert.equal(review.safeEvents.length, 0);
  assert.equal(review.eventConflicts.length, 1);
  assert.equal(review.hasConflicts, true);
});

test("aggregates monthly attendance by event type", () => {
  const rows = buildMonthlyAttendance([
    { date: "2026-09-01", eventType: "festival" },
    { date: "2026-09-02", eventType: "taiban" },
    { date: "2026-08-01", eventType: "one_man" },
  ], 2, "2026-09-28");
  assert.deepEqual(rows.map(({ key, festival, one_man, taiban, unclassified, total }) => ({ key, festival, one_man, taiban, unclassified, total })), [
    { key: "2026-08", festival: 0, one_man: 1, taiban: 0, unclassified: 0, total: 1 },
    { key: "2026-09", festival: 1, one_man: 0, taiban: 1, unclassified: 0, total: 2 },
  ]);
});

test("builds a selected artist song ranking without mixing other artists", () => {
  const ranking = buildArtistSongRanking([{ id: 1, songs: [
    { artist: "Artist A", title: "Song 1" },
    { artist: "Artist B", title: "Song 1" },
    { artist: "artist a", title: "Song 1" },
  ] }], "Artist A");
  assert.deepEqual(ranking, [{ artist: "Artist A", title: "Song 1", count: 2 }]);
});

test("shows reminders only after the event day and excludes lost, cancelled, and pre-tracking history", () => {
  const base = { ...createPlannerStore("2026-09-01"), events: [event()] };
  assert.equal(getReminders(base, "2026-09-27").length, 0);
  assert.equal(getReminders(base, "2026-09-28")[0].kind, "attendance");
  assert.equal(getReminders({ ...base, events: [event({ status: "lost" })] }, "2026-09-28").length, 0);
  assert.equal(getReminders({ ...base, trackingEnabledAt: "2026-09-28" }, "2026-09-28").length, 0);
  assert.equal(getReminders({ ...base, trackingEnabledAt: "2026-09-28", events: [event({ createdAt: "2026-09-28T01:00:00.000Z" })] }, "2026-09-28")[0].kind, "attendance");
});

test("reminds about lottery results after the announced date", () => {
  const store = {
    ...createPlannerStore("2026-09-01"),
    events: [event({ status: "waiting_result", date: "2026-10-10", lotteryRounds: [{ id: "lottery-1", applicationDate: "", resultDate: "2026-09-27", result: "pending", ticketType: "", memo: "" }] })],
  };
  assert.equal(getReminders(store, "2026-09-28")[0].kind, "lottery");
});

test("creates candidates only for songs absent from archive and catalog", () => {
  const base = { ...createPlannerStore("2026-09-01"), events: [event({ status: "attended", needsPostEventReview: true })] };
  const history = archiveIdentitySet([{ songs: [{ artist: "Known Artist", title: "Known Song" }] }]);
  const next = upsertPerformance(base, "event-1", "Known Artist", ["Known Song", "New Song"], history, "2026-09-28T00:00:00.000Z");
  assert.equal(next.events[0].needsPostEventReview, false);
  assert.deepEqual(next.songs.map((song) => song.playlistStatus), ["unreviewed", "candidate"]);
  assert.equal(next.songs[0].firstHeardEventId, null);
  assert.equal(next.songs[1].firstHeardEventId, "event-1");
});

test("preserves rehearsal, main, and encore sections in ordered tracks", () => {
  const base = { ...createPlannerStore("2026-09-01"), events: [event({ status: "attended" })] };
  const next = upsertPerformance(base, "event-1", "Artist", [
    { title: "Sound Check", section: "rehearsal" },
    { title: "Main Song", section: "main" },
    { title: "Encore Song", section: "encore" },
  ], new Set());
  assert.deepEqual(next.events[0].performances[0].tracks.map((track) => track.section), ["rehearsal", "main", "encore"]);
});

test("processed playlist states do not return to candidate when a performance is saved again", () => {
  const base = { ...createPlannerStore("2026-09-01"), events: [event({ status: "attended" })] };
  const first = upsertPerformance(base, "event-1", "Artist", ["Song"], new Set(), "2026-09-28T00:00:00.000Z");
  const processed = updatePlaylistStatus(first, first.songs[0].id, "added", "2026-09-28T01:00:00.000Z");
  const savedAgain = upsertPerformance(processed, "event-1", "Artist", ["Song"], new Set(), "2026-09-28T02:00:00.000Z");
  assert.equal(savedAgain.songs[0].playlistStatus, "added");
  assert.equal(savedAgain.songs.length, 1);
});

test("runs the lottery-to-setlist-to-playlist lifecycle scenarios", () => {
  const today = "2026-09-28";
  const futureDate = "2026-10-10";
  const yesterday = "2026-09-27";
  const createdAt = "2026-09-28T01:00:00.000Z";
  const baseEvent = event({
    title: "King Gnu Live",
    date: futureDate,
    status: "waiting_result",
    createdAt,
    lotteryRounds: [{ id: "lottery-1", applicationDate: "2026-09-20", resultDate: "2026-10-01", result: "pending", ticketType: "先行", memo: "" }],
  });
  let store = { ...createPlannerStore(today), events: [baseEvent] };

  // Scenario 1: waiting result is upcoming but does not need action before result date.
  assert.deepEqual(getUpcomingEvents(store, today).map((item) => item.title), ["King Gnu Live"]);
  assert.equal(getReminders(store, today).length, 0);

  // Scenario 2: confirmed future event remains upcoming without a reminder.
  store = { ...store, events: [{ ...baseEvent, status: "confirmed", lotteryRounds: [{ ...baseEvent.lotteryRounds[0], result: "won" }] }] };
  assert.equal(getUpcomingEvents(store, today)[0].status, "confirmed");
  assert.equal(getReminders(store, today).length, 0);

  // Scenario 3: a newly-created past-date confirmed event is actionable.
  store = { ...store, events: [{ ...store.events[0], date: yesterday }] };
  assert.equal(getReminders(store, today)[0].kind, "attendance");

  // Scenario 4: attended without a setlist asks for post-event review.
  store = { ...store, events: [{ ...store.events[0], status: "attended", needsPostEventReview: true }] };
  assert.equal(getReminders(store, today)[0].kind, "setlist");

  // Scenario 5: performance is stored and first-heard songs become candidates.
  store = upsertPerformance(store, "event-1", "Artist A", ["Song 1", "Song 2", "Song 3"], new Set(), createdAt);
  assert.equal(store.events[0].performances[0].tracks.length, 3);
  assert.deepEqual(store.songs.map((song) => song.playlistStatus), ["candidate", "candidate", "candidate"]);
  assert.equal(getReminders(store, today).length, 0);

  // Scenario 6: an archive song is not first-heard and starts unreviewed.
  const historical = archiveIdentitySet([{ songs: [{ artist: "Artist A", title: "Known Song" }] }]);
  store = upsertPerformance(store, "event-1", "Artist A", ["Song 1", "Song 2", "Song 3", "Known Song"], historical, createdAt);
  const known = store.songs.find((song) => song.displayTitle === "Known Song");
  assert.equal(known.firstHeardEventId, null);
  assert.equal(known.playlistStatus, "unreviewed");

  // Scenario 7: every processed state survives a repeat setlist save.
  const processedStates = ["already_added", "added", "dismissed"];
  processedStates.forEach((status, index) => { store = updatePlaylistStatus(store, store.songs[index].id, status, createdAt); });
  store = upsertPerformance(store, "event-1", "Artist A", ["Song 1", "Song 2", "Song 3", "Known Song"], historical, createdAt);
  assert.deepEqual(store.songs.slice(0, 3).map((song) => song.playlistStatus), processedStates);
});
