---
type: release-review
project: live-setlist-app
status: approved-release-in-progress
created: 2026-09-29
updated: 2026-09-29
revision: 2
---

# Release Human Gate review

Human承認後、Archive分類（14 `festival` / 4 `one_man` / 0 `taiban`）とSong表示統合（`あつまれ！パーティーピーポー` 5件、`Mr.Cosmo` 2件）を反映した。localStorage migration safetyもRelease対象として検証済み。Production D1 migrationとDeployは、Cloudflare Access Gate通過後に実施する。

## Approved Event Types

全件ともRepository内の`setlist.notes`に`festival`または`solo concert`が明記されている。

| # | Date | Event | Repository evidence | Recommended type | Confidence |
|---:|---|---|---|---|---|
| 1 | 2024-07-13 | DAIENKAI 2024 — 7月13日 | notes=`festival`; 6 artists | `festival` | High |
| 2 | 2025-04-26 | Ado WORLD TOUR 2025 “Hibana” | notes=`solo concert`; Ado only | `one_man` | High |
| 3 | 2025-07-19 | DAIENKAI 2025 — Day 1 | notes=`festival`; 5 listed artists | `festival` | High |
| 4 | 2025-07-20 | DAIENKAI 2025 — Day 2 | notes=`festival`; 5 listed artists | `festival` | High |
| 5 | 2025-08-16 | SUMMER SONIC 2025 TOKYO — 8月16日 | notes=`festival`; selected attended artists | `festival` | High |
| 6 | 2025-09-21 | ROCK IN JAPAN FESTIVAL 2025 — 9月21日 | notes=`festival`; 6 artists | `festival` | High |
| 7 | 2025-12-29 | COUNTDOWN JAPAN 25/26 — 12月29日 | notes=`festival`; 6 artists | `festival` | High |
| 8 | 2025-12-30 | COUNTDOWN JAPAN 25/26 — 12月30日 | notes=`festival`; 9 artists | `festival` | High |
| 9 | 2025-12-31 | COUNTDOWN JAPAN 25/26 — 12月31日 | notes=`festival`; 8 artists | `festival` | High |
| 10 | 2026-01-10 | BABYMETAL LEGEND - METAL FORTH | notes=`solo concert`; BABYMETAL only | `one_man` | High |
| 11 | 2026-05-06 | VIVA LA ROCK 2026 — 5月6日 | notes=`festival`; 6 artists | `festival` | High |
| 12 | 2026-07-04 | 京都大作戦2026 — 7月4日 | notes=`festival`; 6 artists | `festival` | High |
| 13 | 2026-07-23 | THE ORAL CIGARETTES Home Sweet Home TOUR 2026 | notes=`solo concert`; THE ORAL CIGARETTES only | `one_man` | High |
| 14 | 2026-07-31 | DAIENKAI 2026 — Day 1 | notes=`festival`; 6 listed artists | `festival` | High |
| 15 | 2026-08-01 | DAIENKAI 2026 — Day 2 | notes=`festival`; 6 artists | `festival` | High |
| 16 | 2026-08-02 | DAIENKAI 2026 — Day 3 | notes=`festival`; 6 artists | `festival` | High |
| 17 | 2026-08-25 | ヤバイTシャツ屋さん “Magical Tank-top Parade” ONE-MAN TOUR 2026 | notes=`solo concert`; ヤバイTシャツ屋さん only | `one_man` | High |
| 18 | 2026-09-12 | ROCK IN JAPAN FESTIVAL 2026 — 9月12日 | notes=`festival`; 5 artists | `festival` | High |

## Approved Song normalization

### あつまれ!パーティーピーポー

- Artist: ヤバイTシャツ屋さん
- Normalized key: `ヤバイtシャツ屋さん::あつまれ!パーティーピーポー`
- `あつまれ！パーティーピーポー`: 4回（DAIENKAI 2025 Day 2、COUNTDOWN JAPAN 25/26 12/30、DAIENKAI 2026 Day 1、Magical Tank-top Parade）
- `あつまれ!パーティーピーポー`: 1回（京都大作戦2026）
- 現行aggregationはNFKC normalizationにより既に合計5回として扱う。Archive mergeは表示文字を統一するだけでcount/identityは変わらない。

### Mr.COSMO / Mr.Cosmo

- Artist: 四星球
- Normalized key: `四星球::mr.cosmo`
- `Mr.Cosmo`: 1回（COUNTDOWN JAPAN 25/26 12/31）
- `Mr.COSMO`: 1回（DAIENKAI 2026 Day 2）
- 現行aggregationはcase foldingにより既に合計2回として扱う。Archive mergeは表示文字を統一するだけでcount/identityは変わらない。

## Multi-device migration safety

以前はCloudが空でない端末のlocalStorageを表示せず、ScenarioのEvent CはlocalStorageに残るだけだった。現在は次のreview flowを実装した。

1. local migration keyが既にreceiptへ記録済みなら何もしない。
2. 未記録ならCloudとlocalをID/canonical keyで比較する。
3. local-only Event/SongをReview UIへ追加候補として表示する。
4. Humanが「候補をCloudへ追加」を押した場合だけ、Cloudの既存recordを一切変更せず追加する。
5. 同一IDまたは同一canonical songの内容差はConflictとして表示し、自動反映しない。
6. localStorageは削除・更新しない。
7. Serverもreviewed mergeが既存Cloud recordを削除・変更していないことを検証し、revision競合は409にする。

Scenario結果は「B. Event CをMigration候補としてHumanへ提示し、承認操作後にA. Cloudへ安全に追加」。

## Production state

- URL: `https://live-setlist-app.garage-lab.workers.dev/`
- 2026-09-28 23:59 JST前後の未認証probe: Root `200`、`/api/setlists` `200`、`/api/planner` `404`（未deploy route）。Access redirect/blockはない。
- 結論: 現行Production Workerに有効なAccess保護はない。`/*`は保護されていない。
- Release条件: Zero TrustでSelf-hosted applicationを作成し、destinationにWorker `live-setlist-app`（全route、必要ならpreviewも含む）を選択。Allowは本人identityだけにし、未認証Root/APIがAccess login/blockになりorigin responseへ到達しないことを確認する。

## Remote D1 state and migration plan

### Current

- Database: `live-setlist-prod` / `9f616af4-82b0-4385-8f70-d13b82f7a6fa`
- Region: APAC; read replication disabled; application tables/rows are empty。
- `sqlite_master`に見えるのはCloudflare internal `_cf_KV`だけ。
- Pending migrations: `0000_melodic_may_parker.sql` and `0001_cloud_planner.sql`。
- Current Time Travel bookmark: `00000002-00000002-000050f4-7640925c09edab9c40962e9e9967f376`（調査時点）。
- Existing export: `C:\dev\backups\live-setlist-app\2026-09-28\live-setlist-prod-full.sql`; SHA-256 `309D1516F5D4F4F792B17106F7B761312F848C634E3028D70E6EB8ED39DF7398`; empty DBを示すPRAGMAのみ。

### Pre-migration

1. `wrangler d1 info live-setlist-prod --json`
2. `wrangler d1 time-travel info live-setlist-prod --json`で直前bookmarkを保存。
3. `wrangler d1 export live-setlist-prod --remote --output C:\dev\backups\live-setlist-app\2026-09-29\pre-cloud-planner.sql`
4. `Get-FileHash -Algorithm SHA256`、file size、SQL内容を確認。
5. `wrangler d1 migrations list live-setlist-prod --remote`でpendingを再確認。

### Apply

`npm.cmd exec wrangler -- d1 migrations apply live-setlist-prod --remote`

このcommandは`0001`だけでなく未適用の`0000`も適用する。`0000`は空のlegacy `setlists` / `songs` / `setlist_songs`、`0001`は`planner_state` / `planner_migrations`を追加する。明示的なsecondary indexはなく、PK用SQLite indexだけが作られる。既存application dataは空で、Archive JSONはD1外なので変更されない。

### Verification

1. migration listが`No migrations to apply`になる。
2. `sqlite_master`で5 application tablesと`d1_migrations`を確認。
3. 各table countが0、Archive APIが18公演・813曲のまま、mutationが405であることを確認。
4. Access認証後にPlanner GET、空Cloud import、PUT、stale revision 409、別端末reviewed mergeを確認。
5. localStorageが両端末に残り、Cloud failure時にも変更されないことを確認。

### Rollback

- Deploy前のschema問題: 直前bookmarkへTime Travel restoreする。これはDBを上書きする破壊操作なので、別Human承認後だけ行う。
- Deploy後のapplication問題: Workerを以前のVersionへrollbackし、D1 tablesとPlanner dataは削除しない。旧VersionはD1を参照しないためdataを温存できる。
- Planner dataが書かれた後にpre-migration bookmarkへ戻すとPlanner dataを失うため、先にpost-failure export/bookmarkを保存する。必要ならcode rollbackを優先し、DB restoreは最後の手段とする。
- Export SQLとTime Travel bookmarkの両方を保持し、Archive JSON/localStorageは変更しない。

## Validation

- typecheck: PASS
- lint: PASS
- production build: PASS
- Node unit/contract tests: 26/26 PASS
- Playwright: 6/6 PASS（375/390/430/1024、keyboard、revision 409、reviewed merge API）
- Production dependency audit: 0 vulnerabilities
- Archive audit: 18 events / 813 tracks; no mutation
