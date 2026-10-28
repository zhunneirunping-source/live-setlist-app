import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildPlannerMigrationReview, loadPlannerStore } from "../lib/live-planner.js";

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const fields = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !equal(a[key], b[key]));
function parse(raw) {
  const parsed = JSON.parse(raw);
  const loaded = loadPlannerStore(JSON.stringify(parsed.store ?? parsed));
  if (!loaded.store) throw new Error("Invalid planner document; originals were not changed");
  return loaded.store;
}
const counts = store => ({ events: store.events.length, songs: store.songs.length, performances: store.events.reduce((n, e) => n + (e.performances?.length ?? 0), 0), tracks: store.events.flatMap(e => e.performances ?? []).reduce((n, p) => n + p.tracks.length, 0) });

export function comparePlanner(cloudRaw, localRaw) {
  const cloud = parse(cloudRaw), local = parse(localRaw);
  const review = buildPlannerMigrationReview(local, cloud);
  const classify = (kind, match) => {
    const used = new Set();
    const result = { cloudOnly: [], localOnly: [], identical: [], different: [] };
    for (const row of local[kind]) {
      const other = cloud[kind].find(c => match(row, c));
      if (!other) result.localOnly.push(row);
      else {
        used.add(other.id);
        if (equal(row, other)) result.identical.push(row.id);
        else result.different.push({ local: row, cloud: other, fields: fields(row, other) });
      }
    }
    result.cloudOnly = cloud[kind].filter(row => !used.has(row.id));
    return result;
  };
  return {
    generatedAt: new Date().toISOString(),
    sha256: { cloud: createHash("sha256").update(cloudRaw).digest("hex"), local: createHash("sha256").update(localRaw).digest("hex") },
    counts: { cloud: counts(cloud), local: counts(local) },
    events: classify("events", (a, b) => a.id === b.id),
    songs: classify("songs", (a, b) => a.id === b.id || a.canonicalKey === b.canonicalKey),
    legacyConflictCount: review.eventConflicts.length + review.songConflicts.length,
    blockedLocalEvents: review.eventConflicts.filter(row => row.reason === "song_conflict_or_missing"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cloudPath, localPath, output] = process.argv.slice(2);
  if (!cloudPath || !localPath || !output) throw new Error("Usage: node scripts/compare-planner.mjs cloud.json iphone.json outputs/diff.json");
  const report = comparePlanner(await readFile(cloudPath, "utf8"), await readFile(localPath, "utf8"));
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ counts: report.counts, legacyConflictCount: report.legacyConflictCount }));
}
