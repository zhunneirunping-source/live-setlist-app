---
type: release-review
project: live-setlist-app
status: released
created: 2026-09-29
updated: 2026-09-29
revision: 3
---

# Release Human Gate review

Human承認後、Archive分類、Song表示統合、multi-device migration、Cloudflare Access、Production D1 migration、Worker deploy、PC / Smartphone同期確認を完了した。Release commitは`89eef06ca24bade29174902a5d7da1c823a29080`、Production Worker Versionは`9e63d338-fece-4b4c-919d-3400e0358431`。

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

### あつまれ！パーティーピーポー

- Artist: ヤバイTシャツ屋さん
- Normalized key: `ヤバイtシャツ屋さん::あつまれ!パーティーピーポー`
- `あつまれ！パーティーピーポー`: 5回へ表示統一済み。
- NFKC normalized identityと合計countは変更なし。

### Mr.COSMO / Mr.Cosmo

- Artist: 四星球
- Normalized key: `四星球::mr.cosmo`
- `Mr.Cosmo`: 2回へ表示統一済み。
- Case-folded normalized identityと合計countは変更なし。

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
- Access: Worker全routeを本人identityだけに限定して有効化済み。
- 未認証Root、`/api/planner`、`/api/setlists`はすべてAccess loginへの`302`で、origin responseへ到達しない。
- 認証済み`/api/planner`はPASS。D1 `updated_by`にAccess本人identityが記録されることを確認済み。
- Active Worker Version: `9e63d338-fece-4b4c-919d-3400e0358431`（100%）。

## Remote D1 state and migration plan

### Current

- Database: `live-setlist-prod` / `9f616af4-82b0-4385-8f70-d13b82f7a6fa`
- Region: APAC; read replication disabled。
- `0000_melodic_may_parker.sql`と`0001_cloud_planner.sql`は適用済み。Pendingは0。
- Application tables: `setlists`, `songs`, `setlist_songs`, `planner_state`, `planner_migrations`。
- Planner verification: revision 3、4 events、79 songs、migration receipt 1件。

### Pre-migration

1. `wrangler d1 info live-setlist-prod --json`
2. `wrangler d1 time-travel info live-setlist-prod --json`で直前bookmarkを保存。
3. `wrangler d1 export live-setlist-prod --remote --output C:\dev\backups\live-setlist-app\2026-09-29\pre-release-live-setlist-prod.sql`
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

実施結果: bookmark `00000004-00000000-000050f4-d9e8cdb20994c00f2bf6f3052eb259ec`、export size 224 bytes、SHA-256 `B60C06C82D51EB85C953000442EB148F8676A1B92D7F0D0360864124B11B85A1`。Migration、schema、pending 0、Planner GET/PUT、409、reviewed mergeをすべて確認済み。

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
- Production PC registration / Smartphone read / Smartphone update to PC: PASS
- Production stale revision 409: PASS
- Production localStorage candidate review / approved cross-device merge: PASS
- Production authenticated Planner API / Access identity propagation: PASS
