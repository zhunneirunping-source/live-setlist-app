import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;
async function fetchWorker(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    request,
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function render() {
  return fetchWorker(new Request("http://localhost/", {
    headers: { accept: "text/html" },
  }));
}

test("server-renders the setlist dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /<title>Live Setlist App<\/title>/i);
  assert.match(html, /Live Setlist App/);
  assert.match(html, /次のライブと、終わった後の記録/);
  assert.match(html, /対応が必要/);
  assert.match(html, /今すぐ対応する記録はありません/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps the dashboard UI self-contained and disposable", async () => {
  const [page, dashboard, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/SetlistDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SetlistDashboard/);
  assert.match(page, /metadata:/);
  assert.match(dashboard, /use client/);
  assert.match(dashboard, /localStorage/);
  assert.match(dashboard, /ライブを登録/);
  assert.doesNotMatch(dashboard, /method:\s*["'](?:POST|PUT|DELETE)["']/);
  assert.match(layout, /title:\s*"Live Setlist App"/);
  assert.match(css, /setlist|song|track|setlist-panel/i);
  assert.doesNotMatch(css, /react-loading-skeleton|sites-skeleton/);
});

test("rejects production setlist writes at the route boundary", async () => {
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await fetchWorker(new Request("http://localhost/api/setlists", { method }));
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "GET", method);
  }
});
