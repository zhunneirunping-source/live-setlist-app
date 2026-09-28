import { readdir, readFile } from "node:fs/promises";

const source = new URL("../初期移行データ/", import.meta.url);
const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/[‐‑‒–—―−]/g, "-").replace(/\s+/g, " ").trim().toLocaleLowerCase("ja-JP");
const files = (await readdir(source)).filter((name) => name.endsWith(".json")).sort();
const rows = await Promise.all(files.map(async (file) => ({ file, data: JSON.parse(await readFile(new URL(file, source), "utf8")) })));

function variants(values) {
  const groups = new Map();
  for (const value of values.filter(Boolean)) {
    const key = normalize(value);
    const set = groups.get(key) ?? new Set();
    set.add(value.trim());
    groups.set(key, set);
  }
  return [...groups.entries()].filter(([, set]) => set.size > 1).map(([key, set]) => ({ key, variants: [...set].sort() }));
}

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    events: rows.length,
    tracks: rows.reduce((sum, row) => sum + (row.data.songs?.length ?? 0), 0),
  },
  humanReview: {
    eventTypes: rows
      .map(({ file, data }) => ({ file, title: data.setlist?.title ?? data.title ?? "", eventType: data.setlist?.eventType ?? data.eventType ?? null }))
      .filter((row) => !["festival", "one_man", "taiban"].includes(row.eventType)),
    eventNames: variants(rows.map(({ data }) => data.setlist?.title ?? data.title)),
    venues: variants(rows.map(({ data }) => data.setlist?.venue ?? data.venue)),
    artists: variants(rows.flatMap(({ data }) => (data.songs ?? []).map((song) => song.artist))),
    songs: variants(rows.flatMap(({ data }) => (data.songs ?? []).map((song) => `${song.artist}::${song.title}`))),
  },
};

console.log(JSON.stringify(report, null, 2));
