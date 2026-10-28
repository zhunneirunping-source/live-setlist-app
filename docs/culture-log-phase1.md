# Culture Log Phase 1 — ウォッチリスト

## Scope and reuse

5ジャンル（ライブ・音楽、映画、美術展、書籍、ミュージカル・演劇）の対象について、名前、ジャンル、最重要／通常を登録する。名前・重要度の編集、ジャンル絞り込み、確認付きウォッチ解除、履歴から選択したアーティストの一括登録を提供する。ジャンルは登録後に変更せず、必要なら解除・再登録する。

既存のD1 binding、Cloudflare Access認証、parameterized SQL、revisionによる楽観ロック、UIのfield / form / row / buttonとnavigationを再利用する。認証とD1取得だけを`lib/cloud-database.js`へ共有化し、Plannerの保存・移行禁止方針は変更しない。既存の未コミットCloud正本化変更を保持する。

## Data and API

- `drizzle/0002_culture_watchlist.sql`は`watchlist_state`テーブルを追加するだけ。既存テーブル・Archive JSON・Planner documentには変更しない。
- 単一行（id=1）に`document`, `revision`, `updated_at`, `updated_by`を保存。documentは`{version:1, targets:[{id,name,genre,priority,createdAt,updatedAt}]}`。
- `genre`: `music | film | art | books | theatre`。`priority`: `important | normal`。
- `GET /api/watchlist`と`PUT /api/watchlist`。PUT bodyは`{store, revision}`。読取・書込responseは`{store, revision, updatedAt}`。未作成は空一覧・revision 0。
- 保存はINSERT競合保護と`WHERE revision = ?`付きUPDATE。古いrevisionは409と最新状態を返す。保存が成功したresponseだけを画面に採用する。
- Plannerとは別revision。旧クライアントのPlanner全体保存にウォッチ対象が含まれなくても消失せず、ウォッチ操作もライブ情報を変更しない。PC・iPhoneとも同じCloud行へアクセスする。
- 名前はtrim後1〜200文字。既存のNFKC・大小文字・空白・dash正規化を再利用し、同一ジャンル内で重複を拒否する。他ジャンルの同名対象は許可する。意味的な別名・翻訳名の自動統合はしない。
- ID重複、未知version / genre / priority、不正timestampを拒否。上限は2000件、bodyは実受信1 MiB。SQLはすべてbindする。responseはprivate/no-store。
- localStorage、端末への永続保存、オフライン書込queue、旧端末データ取込は追加しない。未接続は更新不可・再読込。保存失敗時は入力保持、409では最新一覧と再操作案内を表示する。
- 解除は当該targetを配列から除き、同じrevision保護付きPUTで保存。新規の削除基盤・tombstone・別の履歴管理は作らない。

## Attendance candidates

Cloudは`status=attended`の`performances[].artistName`だけを抽出する。出演予定リスト`event.artists`や曲catalogのartistから推測しない。実演記録があれば曲未入力でも候補となる。Archiveは既存の観覧済みセトリの`songs[].artist`（演者として記録された名前）を抽出する。原曲者をnotes等から推測・追加しない。

既存対象と正規化して重複排除し、未登録候補だけを表示。選択対象だけを通常または最重要で一括登録する。閲覧だけでは保存せず、履歴は変更しない。CloudとArchiveの取得が完了するまで候補登録を表示しない。Archiveの実演者データ以上の観覧情報は推測しない。

## Verification

- Unit: 全ジャンル、重要度、編集、解除、正規化重複、候補の除外条件・冪等性・履歴非変更。
- API: 実routeと実SQLite SQL（D1 transportのみadapter）で認証、不正body・サイズ、同時更新409、永続readback、削除、未知stored version拒否、既存Planner行の完全保持。migrationは2回適用して安全性を確認。
- Playwright: 360 / 375 / 390 / 430 / 768 / 1024 / 1440pxでCRUD、5ジャンル、filter、候補選択、重複拒否、focus、長い日本語、横overflow、再読込。通信失敗・再試行・競合はroute mockで再現。
- 別の実ローカルD1テストではPCとiPhone相当の独立context間で保存、409、最新readback、重要度編集を確認し、Plannerの前後response一致を検証する。本番・実機Safariの確認とは区別する。

```powershell
# 全てローカル。専用DBにはテスト用データだけを保存する。
$env:WRANGLER_WRITE_LOGS='false'
npm.cmd exec wrangler -- d1 migrations apply live-setlist-prod --local --persist-to .wrangler/culture-phase1-tests
npm.cmd run security:gate
npm.cmd exec wrangler -- dev --config dist/server/wrangler.json --port 3001 --persist-to .wrangler/culture-phase1-tests
# 別terminal
$env:PLANNER_TEST_MODE='1'
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3001'
npm.cmd run test:e2e -- --workers=1
```

## Local closeout — 2026-10-28

- `npm.cmd run security:gate`: PASS（lint、typecheck、build、unit/API 43件、dependency audit）。High例外0件。
- 本番相当buildを専用ローカルD1で起動し、`PLANNER_TEST_MODE=1` / port 3001で全Playwright **30件PASS**。既存Cloud正本化・同期・楽曲管理・レスポンシブテストを含む。
- 最終contrast調整後、lint / build、および390 / 1440pxのCRUDブラウザテストを再実施してPASS。primary textは5.35:1、解除textはpanel上5.01:1。従来のwhite/accentは3.25:1だったため、この画面内で修正した。
- `data:audit`: Archive 18公演・813曲、humanReview候補なし。Archive・package / lockfileの差分なし。実ローカルDBのウォッチ操作前後でPlanner response完全一致。
- `git diff --check`: PASS。既存未コミット変更は保持。commit / push / 本番migration / deployは未実施。
- Buildの既存Vite config / sourcemap warningは継続。実機Safari・screen reader・Production Access検証は未実施。gitleaks executableがローカルにないため専用Secret scanとremote CIは未実行（CI workflowの既存gitleaks stepは維持）。コードレビューで新規Secret・外部送信・unsafe HTMLがないことを確認した。

UI Quality Gate（self review、2026-10-28）:

| 項目 | 判定・根拠 |
| --- | --- |
| Visual Hierarchy | PASS — 一覧を中心に、候補登録はdetailsへ配置 |
| Information Architecture | PASS — 1画面、全destinationがmobileで表示される |
| Consistency | PASS — 既存token、field / form / row / buttonを再利用 |
| Anti AI Slop | PASS — 装飾・fake data・card量産なし |
| Responsive | PASS — 360〜1440px、長い日本語とoverflow、390/1440の画像目視確認 |
| Accessibility | WARNING — keyboard登録・focus復帰・contrastはPASS。実機screen readerは未検証、owner:利用者、follow-up:本番反映後の実機確認 |
| Interaction | PASS — loading / empty / error / retry / 409 / success / 解除確認を検証 |
| Content | PASS — 日本語の具体的な操作・失敗・再操作案内 |
| Unnecessary UI | PASS — 共通一覧と必要な操作だけ |

Overall: WARNING（FAILなし、実機screen reader確認待ち）。Reviewer: 同一session内のReviewer role。

## Production approval and release

**本番反映済み・認証済み操作と実機確認待ち（2026-10-28）。** 利用者の条件付き本番承認と専用branchへのcommit / push承認後、CI Secret scanを含む全Gate成功を確認してmigration `0002`とdeployを実施した。Workerは`cf6d089c-56f8-4af5-a70e-19bae2619c4d`。既存Planner revision 31と全データを保持。[反映・検証結果](culture-log-phase1-release.md)を参照。以下は適用した手順。

1. 承認後、現在のWorker version、Accessの全route保護、D1のpending migrationsをread-only確認する。pendingが`0002`だけでなければ停止する。
2. 新しいD1 full exportとTime Travel bookmarkを取得し、Git外のbackup領域へ保存、hashと復旧可能性を確認する。Plannerのdocument hash、revision、公演・楽曲・出演数と既存テーブル件数も安全な場所に記録する。ユーザー提示の基準はrevision 31、公演12、楽曲131、出演16。相違があれば推測で上書きせず停止する。作業中の新規更新があれば最新baselineとして再確認する。
3. `0002_culture_watchlist.sql`のみ適用。既存Planner・Archiveのhash / 件数 / revisionが一致することを確認し、不一致ならdeployせず停止する。
4. 検証済みコードをbuildしてdeploy。認証済みPC・iPhoneで同一一覧・登録・編集・解除・候補選択を確認。未認証`/api/watchlist`はAccessで拒否されることも確認する。本番test対象は明示したダミーだけに限定する。
5. 本番Plannerの前後hash / 件数 / revisionとArchiveを再確認。ウォッチ操作ではPlanner revisionは変わらない。

影響: 新規テーブル1つ、API1つ、navigation1項目。既存データのseed・変換・再取込なし。migration前に新コードを出すとウォッチ一覧は読込失敗になるため、順序を守る。

復旧: 保存済み旧Worker versionへrollbackし、追加テーブルは保持する（削除しない）。旧画面はウォッチを表示しないが既存機能は継続できる。再deployすればウォッチdataを再利用できる。全DB restoreは後続ライブ更新まで戻すため、異常時に停止し、別途承認と影響評価を経て行う。

## Scope review and remaining checks

自動収集、crawler、定期実行、通知、AI推薦、作品／鑑賞履歴、詳細master、tag基盤、新規dependencyは追加していない。大規模refactorなし。Technology LearningはType 0（既存のCloud正本・重複排除・楽観ロックの適用）。Vault外のこのrepositoryに仕様・手順を記録し、別repositoryのKnowledgeは未更新。

本番baseline確認、backup復元検証、migration、deploy、前後比較は完了。認証済み本番CRUD・既存機能smoke・PC / 実機iPhone Safari確認が残る。
