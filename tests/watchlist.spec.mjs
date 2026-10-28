import { expect, test } from "@playwright/test";
import { createPlannerStore } from "../lib/live-planner.js";
import { createWatchStore } from "../lib/watchlist.js";

const planner = { ...createPlannerStore(), events: [
  { id: "seen", title: "観覧公演", date: "2026-01-01", status: "attended", artists: ["未観覧の出演者"], performances: [{ artistName: "観覧アーティスト", tracks: [] }], lotteryRounds: [] },
  { id: "future", title: "予定公演", date: "2099-01-01", status: "confirmed", artists: ["予定アーティスト"], performances: [], lotteryRounds: [] },
] };

async function setup(page) {
  let store = createWatchStore(), revision = 0, mode = "ok";
  const plannerWrites = [];
  await page.route("**/api/planner**", route => {
    if (route.request().method() !== "GET") plannerWrites.push(route.request().method());
    return route.fulfill({ json: { store: planner, revision: 31 } });
  });
  await page.route("**/api/setlists**", route => route.fulfill({ json: { setlists: [] } }));
  await page.route("**/api/watchlist", route => {
    if (mode === "offline") return route.abort();
    if (route.request().method() === "PUT") {
      if (mode === "fail") return route.fulfill({ status: 503, json: { error: "offline" } });
      const body = route.request().postDataJSON();
      if (mode === "conflict" || body.revision !== revision) {
        revision++;
        return route.fulfill({ status: 409, json: { store, revision } });
      }
      store = body.store; revision++;
    }
    return route.fulfill({ json: { store, revision } });
  });
  await page.goto("/");
  await expect(page.getByText("予定公演", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ウォッチリスト", exact: true }).click();
  await expect(page.getByRole("button", { name: "対象を追加", exact: true })).toBeEnabled();
  return { store: () => store, plannerWrites, mode: value => { mode = value; } };
}

for (const width of [360, 375, 390, 430, 768, 1024, 1440]) test(`watchlist CRUD and history at ${width}px`, async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: 844 });
  const state = await setup(page);
  for (const [genre, name] of [["music", "音楽対象"], ["film", "映画対象"], ["art", "美術館対象"], ["books", "書籍対象"], ["theatre", "長い日本語の劇団名".repeat(8)]]) {
    await page.getByRole("button", { name: "対象を追加", exact: true }).click();
    await expect(page.getByLabel("名前 *", { exact: true })).toBeFocused();
    await page.getByLabel("名前 *", { exact: true }).fill(name);
    await page.getByRole("combobox", { name: "ジャンル", exact: true }).selectOption(genre);
    await page.getByRole("combobox", { name: "重要度", exact: true }).selectOption("important");
    if (genre === "theatre" && [390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`watch-editor-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("button", { name: "対象を追加", exact: true })).toBeFocused();
  }
  expect(state.store().targets).toHaveLength(5);
  await page.getByRole("combobox", { name: "ジャンルで絞り込み", exact: true }).selectOption("film");
  await expect(page.locator(".watch-rows > li")).toHaveCount(1);
  await page.getByRole("button", { name: "映画対象を編集" }).click();
  await page.getByLabel("名前 *", { exact: true }).fill("編集した映画");
  await page.getByRole("combobox", { name: "重要度", exact: true }).selectOption("normal");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("映画 · 通常", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "ジャンルで絞り込み", exact: true }).selectOption("all");
  await page.getByRole("button", { name: "対象を追加", exact: true }).click();
  await page.getByLabel("名前 *", { exact: true }).fill(" 音楽対象 ");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("登録済み");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByText("ライブ参戦履歴から登録", { exact: true }).click();
  await expect(page.getByLabel("予定アーティスト", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("未観覧の出演者", { exact: true })).toHaveCount(0);
  expect(state.store().targets).toHaveLength(5);
  await page.getByLabel("観覧アーティスト", { exact: true }).check();
  await page.getByRole("combobox", { name: "候補の重要度", exact: true }).selectOption("important");
  await page.getByRole("button", { name: "選択した候補を登録" }).click();
  await expect(page.getByLabel("観覧アーティスト", { exact: true })).toHaveCount(0);
  expect(state.store().targets).toHaveLength(6);
  await page.getByRole("button", { name: "編集した映画のウォッチ解除" }).click();
  await page.getByRole("button", { name: "解除する", exact: true }).click();
  await expect(page.getByRole("button", { name: "編集した映画を編集" })).toHaveCount(0);
  expect(state.plannerWrites).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath(`watchlist-${width}.png`), fullPage: true });
  await page.reload();
  await expect(page.getByText("予定公演", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ウォッチリスト", exact: true }).click();
  await expect(page.locator(".watch-rows > li")).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("watch registration can be completed using the keyboard", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "対象を追加", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("名前 *", { exact: true })).toBeFocused();
  await page.keyboard.insertText("キーボード登録");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "ジャンル", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "重要度", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("キーボード登録", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "対象を追加", exact: true })).toBeFocused();
});

test("failed saves retain draft; conflict reloads latest; offline read can retry", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "対象を追加", exact: true }).click();
  await page.getByLabel("名前 *", { exact: true }).fill("保持する入力");
  state.mode("fail");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("再試行");
  await expect(page.getByLabel("名前 *", { exact: true })).toHaveValue("保持する入力");
  expect(state.store().targets).toHaveLength(0);
  state.mode("conflict");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("別の端末");
  state.mode("ok");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".watch-rows > li")).toHaveCount(1);
  state.mode("offline");
  await page.reload();
  await expect(page.getByText("予定公演", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ウォッチリスト", exact: true }).click();
  await expect(page.getByRole("button", { name: "再読み込み", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "対象を追加", exact: true })).toBeDisabled();
  state.mode("ok");
  await page.getByRole("button", { name: "再読み込み", exact: true }).click();
  await expect(page.locator(".watch-rows > li")).toHaveCount(1);
});
