import { expect, test } from "@playwright/test";

for (const width of [375, 390, 430, 1024]) {
  test(`home and navigation fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ライブ参戦履歴" })).toBeVisible();
    for (const label of ["ホーム", "ライブ管理", "セトリ", "追加候補", "集計"]) {
      await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("live management and setlist controls are keyboard reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "ライブ管理" }).click();
  await expect(page.getByRole("heading", { name: "ライブ管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ライブを登録" })).toBeVisible();
  await page.getByRole("button", { name: "セトリ" }).click();
  await expect(page.getByRole("button", { name: "曲を追加" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
