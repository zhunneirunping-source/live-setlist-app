import { expect, test } from "@playwright/test";
import { createPlannerStore, upsertPerformance, updatePlaylistStatus } from "../lib/live-planner.js";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ baseURL }) => {
  if (!process.env.PLANNER_TEST_MODE || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Song integration tests require an isolated local server with PLANNER_TEST_MODE=1");
});

function fixture() {
  let store = { ...createPlannerStore(), events: ["song-test-a", "song-test-b"].map((id) => ({ id, title: id, date: "2026-10-26", venue: "Test", eventType: "one_man", status: "attended", artists: ["Fixture Artist"], lotteryRounds: [], performances: [], needsPostEventReview: false, createdAt: "2026-10-26", updatedAt: "2026-10-26" })) };
  store = upsertPerformance(store, "song-test-a", "Fixture Artist", ["Supernova", "Unavailable Song", "Added Song", "Review Song", "Supernova live"], new Set());
  for (const [title, status, reason] of [["Unavailable Song", "unavailable", "公開音源なし"], ["Added Song", "already_added"], ["Review Song", "unreviewed"]]) {
    store = updatePlaylistStatus(store, store.songs.find((song) => song.displayTitle === title).id, status, undefined, reason);
  }
  return store;
}

for (const width of [375, 390, 430, 1024]) test(`song selection, unavailable, rename and merge at ${width}px`, async ({ page, request }, testInfo) => {
  const initial = await (await request.get("/api/planner")).json();
  const store = fixture();
  expect((await request.put("/api/planner", { data: { store, revision: initial.revision } })).ok()).toBeTruthy();
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^追加候補 2$/ })).toBeVisible();
  await page.getByRole("button", { name: /^追加候補/ }).first().click();
  await expect(page.locator(".playlist-row")).toHaveCount(2);
  await expect(page.locator(".playlist-row").filter({ hasText: "Added Song" })).toHaveCount(0);
  await page.locator(".playlist-tools select").first().selectOption("unreviewed");
  await expect(page.locator(".playlist-row")).toHaveCount(1);
  await page.locator(".playlist-tools select").first().selectOption("all");
  await expect(page.locator(".playlist-row")).toHaveCount(5);
  await page.getByRole("button", { name: "セトリ", exact: true }).click();
  await page.locator(".compact-editor select").nth(0).selectOption("song-test-b");
  await page.locator(".compact-editor select").nth(1).selectOption("Fixture Artist");
  await page.getByRole("combobox", { name: "1曲目", exact: true }).fill("Supernov");
  await page.getByRole("button", { name: "Supernova · 追加候補", exact: true }).click();
  await page.getByText("当日の曲名・演奏形態", { exact: true }).click();
  await page.getByLabel("当日の曲名（替え歌など）").fill("当日の替え歌");
  await page.getByLabel("演奏形態・音源の補足").fill("替え歌の音源なし");
  await page.screenshot({ path: testInfo.outputPath("song-editor.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "セトリを保存", exact: true }).click();
  await expect(page.getByText("セトリを保存し、集計とプレイリスト候補を更新しました。", { exact: true })).toBeVisible();
  let saved = await (await request.get("/api/planner")).json();
  expect(saved.store.songs).toHaveLength(5);
  expect(saved.store.events[1].performances[0].tracks[0].songId).toBe(store.songs[0].id);
  expect(saved.store.events[1].performances[0].tracks[0].performedTitle).toBe("当日の替え歌");
  await page.getByRole("button", { name: /^追加候補/ }).first().click();
  await page.locator(".playlist-tools select").first().selectOption("all");
  const row = page.locator(".playlist-row").filter({ has: page.getByText("Supernova", { exact: true }) });
  await row.getByLabel("Supernovaの状態", { exact: true }).selectOption("unavailable");
  await page.getByLabel("登録不可の理由（原曲全体について）").fill("公開音源なし");
  await page.getByRole("button", { name: "理由を保存して登録不可にする" }).click();
  await expect(row.getByLabel("Supernovaの状態", { exact: true })).toHaveValue("unavailable");
  await row.getByLabel("Supernovaの状態", { exact: true }).selectOption("already_added");
  await expect(row.getByLabel("Supernovaの状態", { exact: true })).toHaveValue("already_added");
  const liveRow = page.locator(".playlist-row").filter({ has: page.getByText("Supernova live", { exact: true }) });
  await liveRow.getByRole("button", { name: "曲の詳細" }).click();
  await page.getByLabel("正式な曲名").fill("Supernova live version");
  await page.getByRole("button", { name: "曲名を修正（旧名を別名に保存）" }).click();
  await page.locator(".playlist-row").filter({ hasText: "Supernova live version" }).getByRole("button", { name: "曲の詳細" }).click();
  await page.getByText("重複曲を統合", { exact: true }).click();
  await page.getByLabel("統合先").selectOption(store.songs[0].id);
  await page.getByRole("button", { name: "同一曲と確認して統合する" }).click();
  await expect(page.locator(".playlist-row")).toHaveCount(4);
  saved = await (await request.get("/api/planner")).json();
  expect(saved.store.events[0].performances[0].tracks).toHaveLength(5);
  expect(saved.store.songs.find((song) => song.id === store.songs[4].id).mergedIntoSongId).toBe(store.songs[0].id);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("local D1 rejects stale revisions, v1 writes and invalid references", async ({ request }) => {
  const current = await (await request.get("/api/planner")).json();
  const data = { store: fixture(), revision: current.revision };
  const success = await request.put("/api/planner", { data });
  expect(success.ok()).toBeTruthy();
  const saved = await success.json();
  expect((await request.put("/api/planner", { data })).status()).toBe(409);
  expect((await request.put("/api/planner", { data: { store: { ...data.store, version: 1 }, revision: saved.revision } })).status()).toBe(400);
  const invalid = structuredClone(data.store);
  invalid.events[0].performances[0].tracks[0].songId = "missing";
  expect((await request.put("/api/planner", { data: { store: invalid, revision: saved.revision } })).status()).toBe(400);
  expect((await (await request.get("/api/planner")).json()).revision).toBe(saved.revision);
});
