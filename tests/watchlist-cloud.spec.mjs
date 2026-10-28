import { expect, test } from "@playwright/test";

test("two device contexts share local D1 and reject stale writes without touching Planner", async ({ browser, request, baseURL }) => {
  if (process.env.PLANNER_TEST_MODE !== "1" || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Requires isolated local D1 with PLANNER_TEST_MODE=1 and migrations applied");
  const before = await (await request.get("/api/planner")).json();
  const initial = await (await request.get("/api/watchlist")).json();
  expect(initial.store).toBeDefined();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pc = await desktop.newPage(), iphone = await phone.newPage();
  const name = `D1共有テスト-${Date.now()}`;
  try {
    for (const page of [pc, iphone]) {
      const cloudRead = page.waitForResponse(response => response.url().includes("/api/planner") && response.status() === 200);
      await page.goto(baseURL);
      await cloudRead;
      // Wait for client hydration by changing an existing control before navigating.
      await page.getByRole("button", { name: "6か月", exact: true }).click();
      await expect(page.getByText("直近6か月・月別", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "ウォッチリスト", exact: true }).click();
      await expect(page.getByRole("button", { name: "対象を追加", exact: true })).toBeEnabled();
    }
    await pc.getByRole("button", { name: "対象を追加", exact: true }).click();
    await pc.getByLabel("名前 *", { exact: true }).fill(name);
    await pc.getByRole("combobox", { name: "ジャンル", exact: true }).selectOption("books");
    await pc.getByRole("button", { name: "保存", exact: true }).click();
    await expect(pc.getByText(name, { exact: true })).toBeVisible();
    // The phone still has the earlier revision and must not replace the PC's saved record.
    await iphone.getByRole("button", { name: "対象を追加", exact: true }).click();
    await iphone.getByLabel("名前 *", { exact: true }).fill(`${name}-phone`);
    await iphone.getByRole("button", { name: "保存", exact: true }).click();
    await expect(iphone.getByRole("alert")).toContainText("別の端末");
    await expect(iphone.getByText(name, { exact: true })).toBeVisible();
    await iphone.getByRole("button", { name: "キャンセル", exact: true }).click();
    await iphone.getByRole("button", { name: `${name}を編集`, exact: true }).click();
    await iphone.getByRole("combobox", { name: "重要度", exact: true }).selectOption("important");
    await iphone.getByRole("button", { name: "保存", exact: true }).click();
    await expect(iphone.getByText("書籍 · 最重要", { exact: true })).toBeVisible();
    await pc.getByRole("button", { name: "ホーム", exact: true }).click();
    await pc.getByRole("button", { name: "ウォッチリスト", exact: true }).click();
    await expect(pc.getByText("書籍 · 最重要", { exact: true })).toBeVisible();
    expect(await (await request.get("/api/planner")).json()).toEqual(before);
  } finally {
    await desktop.close(); await phone.close();
    const current = await (await request.get("/api/watchlist")).json();
    const targets = current.store.targets.filter(row => row.name !== name && row.name !== `${name}-phone`);
    const cleanup = await request.put("/api/watchlist", { data: { store: { ...current.store, targets }, revision: current.revision } });
    expect(cleanup.status()).toBe(200);
  }
});
