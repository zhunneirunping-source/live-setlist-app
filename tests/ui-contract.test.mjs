import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps all planner destinations and the cloud planner controls in the UI contract", async () => {
  const source = await readFile(new URL("../app/SetlistDashboard.tsx", import.meta.url), "utf8");
  const planner = await readFile(new URL("../lib/live-planner.js", import.meta.url), "utf8");
  for (const label of ["ホーム", "ライブ管理", "セトリ", "追加候補", "集計"]) assert.match(source, new RegExp(label));
  for (const label of ["6か月", "1年", "5年", "ステータス", "ライブ形式", "結果発表日", "曲を追加"]) assert.match(source, new RegExp(label));
  assert.match(source, /\/api\/planner/);
  assert.match(source, /plannerMigrationKey/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /候補をCloudへ追加/);
  assert.match(planner, /one_man: "単独"/);
  assert.doesNotMatch(`${source}\n${planner}`, /ワンマン/);
});

test("defines smartphone reflow, usable controls, and bounded dialog behavior", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /\.main-tab-bar\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.form-grid[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.primary-button,[\s\S]*min-height:\s*44px/);
  assert.match(css, /\.modal-card\s*\{[^}]*max-height:\s*90vh/s);
  assert.match(css, /\.field input,[\s\S]*width:\s*100%/);
});

test("keeps the versioned planner migration source without destructive browser-storage calls", async () => {
  const source = await readFile(new URL("../lib/live-planner.js", import.meta.url), "utf8");
  assert.match(source, /live-setlist-planner:v1/);
  assert.doesNotMatch(source, /localStorage\.(?:clear|removeItem)\s*\(/);
});
