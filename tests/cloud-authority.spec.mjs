import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createPlannerStore, PLANNER_STORAGE_KEY, upsertPerformance } from "../lib/live-planner.js";

const event = (title) => ({ id: "authority-test", title, date: "2099-01-01", venue: "Test", status: "confirmed", artists: [], lotteryRounds: [], performances: [] });
const cloud = { ...createPlannerStore(), events: [event("Cloud公演")] };
const legacy = JSON.stringify({ ...cloud, version: 1, events: [event("iPhone旧公演")] });

for (const width of [360, 768, 1024, 1440]) test(`Cloud authority and exact legacy export at ${width}px`, async ({ page }, testInfo) => {
  const writes = [];
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: PLANNER_STORAGE_KEY, raw: legacy });
  await page.route("**/api/planner**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    return route.fulfill({ json: { store: cloud, revision: 7 } });
  });
  await page.goto("/");
  await expect(page.getByText("Cloud公演", { exact: true })).toBeVisible();
  await expect(page.getByText("iPhone旧公演", { exact: true })).toHaveCount(0);
  const button = page.getByRole("button", { name: "旧端末データを書き出す" });
  await button.focus();
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  expect(await readFile(await download.path(), "utf8")).toBe(legacy);
  expect(await page.evaluate(key => localStorage.getItem(key), PLANNER_STORAGE_KEY)).toBe(legacy);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath(`authority-${width}.png`), fullPage: true });
  await page.reload();
  await expect(page.getByText("Cloud公演", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

for (const raw of ["{broken", ""]) test(`invalid legacy ${JSON.stringify(raw)} does not block Cloud`, async ({ page }) => {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: PLANNER_STORAGE_KEY, raw });
  await page.route("**/api/planner**", route => route.fulfill({ json: { store: cloud, revision: 7 } }));
  await page.goto("/");
  await expect(page.getByText("Cloud公演", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "旧端末データを書き出す" })).toBeVisible();
});

test("blocked storage does not block Cloud", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }));
  await page.route("**/api/planner**", route => route.fulfill({ json: { store: cloud, revision: 7 } }));
  await page.goto("/");
  await expect(page.getByText("Cloud公演", { exact: true })).toBeVisible();
});

test("failed Cloud save keeps persisted state and retry preserves event links and tracks", async ({ page }) => {
  let saved = upsertPerformance(cloud, "authority-test", "Test Artist", ["Test Song", "Test Song"], new Set());
  saved.events[0].status = "confirmed";
  let revision = 7;
  let fail = true;
  const original = structuredClone(saved);
  await page.route("**/api/planner**", route => {
    if (route.request().method() === "PUT") {
      if (fail) return route.fulfill({ status: 503, json: { error: "offline" } });
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(revision);
      saved = body.store; revision++;
    }
    return route.fulfill({ json: { store: saved, revision } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "追加候補 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^追加候補/ }).first().click();
  const select = page.getByLabel("Test Songの状態", { exact: true });
  await select.selectOption("already_added");
  await expect(page.getByText(/Cloudへ保存できませんでした/)).toBeVisible();
  expect(saved).toEqual(original);
  await expect(select).toHaveValue("candidate");
  fail = false;
  await select.selectOption("already_added");
  await expect(page.getByText("プレイリスト状態を更新しました。", { exact: true })).toBeVisible();
  expect(saved.songs).toHaveLength(1);
  expect(saved.events).toEqual(original.events);
  expect(saved.events[0].performances[0].tracks.map(t => t.position)).toEqual([1, 2]);
  await page.reload();
  await expect(page.getByText("Cloud公演", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^追加候補/ }).first().click();
  await page.locator(".playlist-tools select").first().selectOption("all");
  await expect(page.getByLabel("Test Songの状態", { exact: true })).toHaveValue("already_added");
});

test("empty or unavailable Cloud never imports legacy data", async ({ page }) => {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: PLANNER_STORAGE_KEY, raw: legacy });
  const writes = [];
  await page.route("**/api/planner**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    return route.fulfill({ json: { store: createPlannerStore(), revision: 0 } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "旧端末データを書き出す" })).toBeVisible();
  await expect(page.getByText("iPhone旧公演", { exact: true })).toHaveCount(0);
  await page.route("**/api/planner**", route => route.abort());
  await page.reload();
  await expect(page.getByText(/共有Plannerへ接続できません/)).toBeVisible();
  expect(writes).toEqual([]);
});
