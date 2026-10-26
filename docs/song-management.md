# Song management

## Storage and compatibility

Planner documents now use version 2. Existing version 1 documents are validated and read into version 2 in memory; GET does not persist the upgrade. Unknown versions, malformed collections and dangling track references are rejected without substituting an empty store. No SQL schema migration or new dependency is required.

POST/PUT require version 2, so an old browser cannot submit a version 1 replacement to the new API. Existing revision checks and Access protection remain required. Do not roll back the server to the original version 1 implementation after version 2 writes: that server does not enforce this write barrier. Rollback requires a version-2-compatible server or a separately approved data restore, with newer edits accounted for. Browser localStorage v1 remains untouched.

Optional song fields: `playlistReason`, `aliases` (approved titles for the same artist), `mergedIntoSongId`. Optional track fields: `performedTitle`, `performanceNote`. Existing song IDs stay stable during correction. Explicit merges retain the source song as an old-ID mapping, redirect every source track and retain its performed title, order and section. Repeated performances are never deduplicated. The explicitly selected target supplies the playlist status and reason; the UI exposes both before confirmation. Covers by different artists cannot merge. Ambiguous matches require explicit selection or review.

The normal candidate view contains `candidate` only, grouped by canonical key. Any processed record with that same key suppresses the candidate. `unreviewed` has its own filter; management “all” includes all active catalog records, including processed states. Merged source records remain in storage. `unavailable` requires a reason and survives subsequent setlist registration; changing the status manually is allowed. A performance note about an unavailable parody recording never changes the original song's playlist state.

## UI contract

Primary: enter/select a song. Secondary: existing-song suggestions and status. Deferred: performance-specific title/note and explicit correction/merge controls. Existing row, field, button and details patterns are reused. Dashboard profile remains primary; Consumer App touch/keyboard rules apply to song entry. No additional navigation or visual theme is introduced.

## Local verification

Use the installed Wrangler locally only, with the isolated persistence directory:

```powershell
$env:WRANGLER_WRITE_LOGS='false'
.\node_modules\.bin\wrangler.cmd d1 migrations apply live-setlist-prod --local --persist-to .wrangler/song-management-tests
$env:PLANNER_TEST_MODE='1'
npm.cmd run dev -- --host 127.0.0.1
```

In another terminal, set `PLANNER_TEST_MODE=1` and run `npm.cmd exec playwright -- test --workers=1`. The new tests replace only fixture data in this isolated local DB; never point them at production or ordinary local data. Browser artifacts are under ignored `.wrangler/playwright-results` to avoid Vite reloads from generated trace HTML. Run lint, typecheck, unit tests, build, security audit and Archive audit separately.

## Production release procedure

1. Use the existing authenticated connection. Historical API error 7403 was not reproduced during release; no credentials or Access settings were changed.
2. Read the current Planner and strictly validate a copy. Any rejected legacy record requires review, never deletion or an empty replacement.
3. Export the current D1 data and record a fresh bookmark; rehearse restoration in an isolated DB. Preserve Archive Git revision and hashes.
4. Approve the server/UI release together. Confirm Access protection, version-1 write rejection, revision 409, PC/phone operations and Archive 18 events / 813 tracks.
5. Data corrections require per-song evidence and separate approval. Snapshot absence does not prove playlist absence.

No production connection, data reconciliation, deployment, Archive edits or spreadsheet writes are part of local verification.

## Verification record (2026-10-26)

- Typecheck, lint, build, security audit and 39 Node tests passed. Archive audit remains 18 events / 813 tracks; original files are unchanged.
- Isolated local D1/browser tests cover revision 409, legacy write rejection, invalid references, ID selection, unavailable/manual status changes, spelling correction and explicit merge. Browser widths: 375, 390, 430, 1024px. Mobile screenshot reviewed.
- UI quality: hierarchy, information architecture, consistency, scope, responsive reflow, interaction and content passed the exercised scenarios. Keyboard focus loss after merge was corrected. Screen-reader, actual phone/virtual-keyboard and production checks are not performed; accessibility/real-device quality remains WARNING for those checks.
- Existing Vite configuration and route-classification build warnings remain; dependencies were not changed.

## Production cleanup completed (2026-10-27)

Planner v2 migration and the approved one-time cleanup are complete. The user saved through the Access-authenticated app; read-only D1 verification confirmed revision 20 -> 21. The temporary component, fixed update module, dedicated fixture/tests and CSS are removed from the final release. Normal song selection, status/reason management, aliases, title correction, performedTitle/performanceNote and explicit merge remain supported. No new API or SQL migration was added.

Final data: 79 songs / 12 events / 9 performances / 79 tracks; already_added 44 / candidate 31 / unreviewed 4. Four corrected titles retain old names in aliases, and exactly four historical rows retain performedTitle. Song IDs, ordered history and references are preserved; duplicate IDs and dangling references are zero. The remaining 35 statuses were intentionally retained; unmatched snapshot entries were not automatically dismissed or marked unavailable. No songs were deleted or merged.

Final persisted document SHA-256: `2C9AE5188AAB2913D6E958037A5AFAA74FE9409EFE905E22298D92768DF60C70`. Canonical verification: `C:\dev\reports\live-setlist-app\2026-10-27\cleanup-final-verification.json`. Backups and restore evidence remain outside Git under `C:\dev\backups\live-setlist-app\2026-10-27`. Never restore blindly over later edits or roll back to a v1-only server.

The temporary-UI release was Worker `10869a50-98d5-4194-94fe-2405aac2fbdb`, based on `da433bc939c1779005afbb958e623b0f42771e3e` plus the reviewed working tree. It passed 54 unit / 14 browser tests before cleanup. Final removal verification and Worker version are recorded below; production authenticated display checks remain explicitly human-confirmed.

Security fixes (2026-10-27): Next/eslint-config-next 16.3.6 -> 16.4.3 (same major), Cloudflare Vite plugin 1.62.2 -> 1.65.0, Vite 8.3.1 -> 8.3.5, Wrangler 4.144.0 -> 4.152.0; scoped image-size 2.0.4 / undici 7.30.1 fixes and compatible source-map-js, zod, fast-uri updates. Critical/High are zero; the unchanged gate needs no High exceptions. Four Moderate records remain for one old esbuild advisory in the Drizzle development loader; no forced parent-range override or Drizzle rollback was performed. Production dependencies audit clean. Detailed advisories/impact: `C:\dev\reports\live-setlist-app\2026-10-27\security-review.md`.

## Final removal release (2026-10-27)

- Worker: `a2a4a228-23d1-4d04-9a5a-eff500ec716e`. Temporary UI/module/fixture/tests/CSS removed; source and compiled bundle checks find no fixed cleanup operation.
- Lint, typecheck, build, unchanged security gate, 39 unit tests and 11 isolated browser tests PASS. The count decrease removes only temporary-operation tests. Browser tests retain song selection, aliases, unavailable/manual statuses, explicit correction/merge, responsive layouts and stale revision protection. Archive audit remains 18 / 813.
- Pre-deploy D1 matches the final cleanup record exactly: v2 / revision 21 / 79-12-9-79 / 44-31-4. No Planner write, migration, Access or credential change is part of this code-only release.
- Authenticated production screen/search/history checks require the user's normal browser. No Computer Use, token extraction or Access workaround is used. Remaining 35 songs are intentionally unchanged; no further cleanup is scheduled.
- Build retains configuration, route-classification and sourcemap warnings. Technology learning sync: Type 0 (no new general mechanism).
