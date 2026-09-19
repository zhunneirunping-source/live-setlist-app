import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeSetlistSeed } from "../lib/setlist-seed.js";

export async function collectSeedEntries(inputPath) {
  const absolutePath = path.resolve(inputPath);
  const info = await stat(absolutePath);

  if (info.isDirectory()) {
    const files = (await readdir(absolutePath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "README.md")
      .map((entry) => path.join(absolutePath, entry.name))
      .sort();

    const payloads = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(file, "utf8");
        return normalizeSetlistSeed(JSON.parse(raw));
      }),
    );

    return payloads;
  }

  const raw = await readFile(absolutePath, "utf8");
  return [normalizeSetlistSeed(JSON.parse(raw))];
}

function escapeSqlString(value) {
  return String(value ?? "").replace(/'/g, "''");
}

function sqlLiteral(value) {
  if (value === null || typeof value === "undefined") return "NULL";
  return `'${escapeSqlString(value)}'`;
}

export function toSql(entries) {
  const lines = [];
  let setlistId = 1;
  let songId = 1;
  let joinId = 1;

  for (const seed of entries) {
    const setlist = seed.setlist;
    lines.push(
      `INSERT INTO setlists (id, title, venue, date, notes) VALUES (${setlistId}, ${sqlLiteral(setlist.title)}, ${sqlLiteral(setlist.venue)}, ${sqlLiteral(setlist.date)}, ${sqlLiteral(setlist.notes)});`,
    );

    for (const song of seed.songs) {
      const currentSongId = songId++;
      lines.push(
        `INSERT INTO songs (id, title, artist, key, duration_seconds, energy, position, notes) VALUES (${currentSongId}, ${sqlLiteral(song.title)}, ${sqlLiteral(song.artist)}, ${sqlLiteral(song.key)}, ${song.durationSeconds ?? "NULL"}, ${song.energy ?? "NULL"}, ${song.position}, ${sqlLiteral(song.notes)});`,
      );
      lines.push(
        `INSERT INTO setlist_songs (id, setlist_id, song_id, position, cue) VALUES (${joinId++}, ${setlistId}, ${currentSongId}, ${song.position}, ${sqlLiteral("")});`,
      );
    }

    setlistId += 1;
  }

  return lines.join("\n");
}

async function main() {
  const inputPath = process.argv[2] ?? "./seed-data.example.json";
  const entries = await collectSeedEntries(inputPath);
  const outputPath = path.resolve(path.dirname(path.resolve(inputPath)), "seed.sql");
  const sql = toSql(entries);

  await writeFile(outputPath, sql, "utf8");

  const totalSongs = entries.reduce((sum, seed) => sum + seed.songs.length, 0);
  console.log(`Seed SQL generated: ${outputPath}`);
  console.log(`Setlists: ${entries.length}`);
  console.log(`Songs: ${totalSongs}`);
  console.log("Next step: npx wrangler d1 execute <database> --local --file ./seed.sql");
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
}
