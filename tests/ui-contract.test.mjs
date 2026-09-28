import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps all planner destinations and explicit playlist explanations in the UI contract", async () => {
  const source = await readFile(new URL("../app/SetlistDashboard.tsx", import.meta.url), "utf8");
  for (const label of ["ホーム", "ライブ管理", "セトリ", "追加候補", "集計"]) assert.match(source, new RegExp(label));
  assert.match(source, /過去ライブで聴いていてYouTube Musicの登録状況が分からない曲は「未確認」/);
  assert.match(source, /過去ライブで記録あり・YouTube Music登録状況は未確認/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
});

test("defines smartphone reflow, usable controls, and bounded dialog behavior", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /\.main-tab-bar\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.form-grid[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.primary-button,[\s\S]*min-height:\s*44px/);
  assert.match(css, /\.modal-card\s*\{[^}]*max-height:\s*90vh/s);
  assert.match(css, /\.field input,[\s\S]*width:\s*100%/);
});

test("keeps the versioned planner store without destructive browser-storage calls", async () => {
  const source = await readFile(new URL("../lib/live-planner.js", import.meta.url), "utf8");
  assert.match(source, /live-setlist-planner:v1/);
  assert.doesNotMatch(source, /localStorage\.(?:clear|removeItem)\s*\(/);
});
