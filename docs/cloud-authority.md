# Cloud正本への移行と同期調査

2026-10-28。コードとassetsの本番反映・旧iPhone JSONの48件分析・本人承認後のブクロックフェスティバルの形式補正は完了。現行Cloudはrevision31。PC/iPhone最終一致確認は未実施で、最終クローズはユーザー確認待ち。下記の初回失敗・承認待ち記録は履歴として保持する。

## 調査結果

- React / Next.js / Vinext、Cloudflare Workers、D1。可変データは`planner_state`の単一JSON documentとrevisionに保存される。events内に抽選・出演者・performance・曲順、songs内に楽曲とplaylist状態を保持する。
- 過去Archiveはサーバーに同梱する18公演・813 tracks。`/api/setlists`は読取専用。legacy D1のsetlists/songs/setlist_songsはブラウザの表示正本ではない。今回はデータ移送やschema変更をしない。
- IndexedDB、Service Worker、端末へのPlanner書込み、オフライン編集キューは検出されなかった。React stateはセッション内のCloud表示・入力用。
- 旧localStorage `live-setlist-planner:v1`は保存されたまま。従来、起動時にmigration keyが未記録ならCloudと比較していた。keyはID集合等から作られ、内容のrevisionではない。
- 比較は同一ID／canonicalKeyのレコード全体を対象にするため、曲名・artist・alias・playlist状態・updatedAt・performanceの変更も競合となる。PCでの表記修正後も旧iPhoneの値が残れば繰り返し表示される。48件はこの表示ロジックと整合するが、実際の48件の原因別内訳は端末エクスポート未取得につき未確定。
- 旧POSTには空Cloudへの自動投入と追加候補の移行経路が存在した。特に空Cloudへの投入はチェック後にupsertするため競合窓があった。今回POST経路を閉じた。
- 通常のCloud保存は既存PUTによるrevision条件付き更新。古いrevisionは409で最新値を返し、自動統合しない。

## 実装

- Cloud GETをlocalStorageエラーから独立させる。旧ローカル値で空Cloudを初期化しない。
- POSTは認証確認後405を返す。旧クライアントからの移行POSTも拒否する。既存migration ledgerは保持する。
- 旧ローカル値は原文をダウンロードできる。壊れたJSONも書き出せる。削除・再保存・自動統合はしない。
- 手動編集はCloud revisionを使うPUTのみ。同期的なin-flight lockで連打を抑制し、成功応答後に表示を確定する。失敗時はCloud表示を維持し、409時は最新Cloudを表示して再確認を促す。
- ページを開き直す／再読み込みすると最新CloudをGETする。常時push同期やバックグラウンド編集は追加しない。iPhoneの編集を端末判定で禁止せず、閲覧中心の運用とする。
- Archiveはサーバー配信を継続する。端末分岐は作らないが、全データの単一Cloud DBへの統合は未実施。ArchiveのDB移行は別途バックアップ・比較・承認が必要。

## データ保護

`wrangler d1 export live-setlist-prod --remote --output outputs/sync-20261028/cloud.sql`を試行。サンドボックス通信失敗後、許可された再試行でもCloudflare API Authentication error 10000となり、バックアップは取得できなかった。認証迂回・別経路・権限変更は実施していない。本番DBの更新・削除・deployは未実施。

既存バックアップ手段はD1 SQL export / Time Travel。Cloudバックアップ・復元UIはない。復元は別途承認する。今回はSQL復元試験未実施であり、復元可能と断定しない。

実Cloudの現時点の件数・hash・関連付け・代表内容、iPhone固有情報は未確認。以前の記録を現在値として流用しない。ローカルArchiveの18公演・813 tracksのみ実測済み。

## 次回の実行順序

1. 本人が`npm.cmd exec wrangler -- login`で認証を復旧する。tokenをチャットへ貼らない。
2. 新しいファイル名でCloud SQL exportを取得しSHA256を記録する。隔離ローカルDBへ復元し整合性・件数・documentを検証する。本番へ復元しない。
3. バックアップ成功・Cloud baseline一致を条件に、コードのみ本番deployする承認を得る。schema/migration/seed/本番データ変更は含めない。Accessは維持する。rollbackは直前Worker版だが、旧版の自動import復活に注意する。
4. iPhoneで以前編集したのと同じURL・同じSafari／ホーム画面アプリを開き、「旧端末データを書き出す」を押す。JSONを「ファイル」へ保存し、空でないことを確認する。両方で編集した可能性がある場合はそれぞれ取得する。サイトデータを消さない。ボタンがなくてもデータ不存在と断定しない。
5. JSONをPCのignored `outputs/`へコピーする。本人認証済み`/api/planner`のGET JSONも同時点で保存する。fixtureを実データの代用にしない。
6. `node scripts/compare-planner.mjs outputs/cloud.json outputs/iphone.json outputs/diff.json`を実行。入力は読取専用、出力は既存ファイルを上書きしない。Cloudのみ／端末のみ／同一／内容差分、変更field、件数、SHA256、旧画面相当の競合数を出力する。reportには私的な内容が含まれるためcommitしない。
7. 端末固有データと紐付けを人が確認し、採否・統合対象を承認するまでCloudへ反映しない。

## 実機受入チェック（未実施）

- PCで承認済みの通常編集を保存し、成功後に再読み込み。iPhoneでも同じURLを再読み込みし、公演・表記・playlist状態・曲順・出演者が一致すること。
- 旧端末JSONが変わらず、Cloudに旧曲名や重複が戻らないこと。
- 同じrevisionを開きPC保存後、古い端末からの保存が409となり、上書きしないこと。本番試験対象は事前承認する。
- 通信を切るとCloud更新が失敗し、保存済みデータを変えないこと。復旧後にCloudを再読み込みする。未送信入力は永続保存しない。
- 端末データ取得・48件の分類・本番反映・実機確認が終わるまで完了解消としない。Culture Log開発は保留する。

## 検証

最終結果はcloseout追記を参照。検証用D1は`.wrangler/song-management-tests`に隔離し、実データを投入しない。自動テストは実iPhoneの証拠にはしない。

UIは既存migration sectionとsecondary-buttonを再利用。360/768/1024/1440pxのoverflow・原文download・keyboard Enterを検証。新規CSS/tokenなし。実iPhone・VoiceOver・high contrast未検証のためUI Quality Gate全体はWARNING。

### 最終closeout

| 検証 | 結果 |
| --- | --- |
| `npm.cmd run build` | PASS。既存のVite設定・sourcemap警告あり |
| `npm.cmd run typecheck` / `npm.cmd run lint` | PASS |
| `npm.cmd run test:unit` | 40/40 PASS |
| `PLANNER_TEST_MODE=1 npm.cmd run test:e2e -- --workers=1` | 20/20 PASS。localhostの隔離D1とモック通信のみ |
| `npm.cmd run security:audit` | PASS、High例外0 |
| `npm.cmd run data:audit` | PASS、18公演・813 tracks、Human Review候補0 |
| `git diff --check` | PASS |
| 実Cloud export／復元／比較 | BLOCKED、API認証エラー10000 |
| PC→本番Cloud→iPhone・再読込 | 未検証 |

初回の追加テストにはCloud読み込み前の操作と不完全fixtureによる失敗があった。待機条件とfixtureを修正し、最終の全unit／E2Eは成功した。既存の楽曲選択・登録不可・曲名修正・統合・stale revision・invalid reference・mobile navigationとkeyboardテストも通過。

Security review: 認証境界を弱めず、旧importをDBアクセス前に拒否。PUTのschema検証・1MiB制限・SQL parameter binding・revision条件を維持。新dependency、外部送信、secret/IAM/schema変更なし。差分は手動でsecret混入を確認した。gitleaks未導入のため専用current-tree/history scanは未実施、今回history変更なし。実Accessと本番バックアップが未検証のためProduction readinessは未達。

UI Quality Gate: Visual Hierarchy / Information Architecture / Consistency / Anti AI Slop / Interaction / Content / Unnecessary UIは変更範囲でPASS。ResponsiveとAccessibilityは自動検査・mobile screenshot・keyboardで確認した範囲はPASS、実iPhone・VoiceOver等はWARNING。全体WARNING。集計表示や既存CSSは変更していない。

Reviewer: 自己レビューでCloud書込みの残存経路、localStorage不変、競合時の挙動、差分スクリプトの入力不変と出力上書き拒否を確認。利用者の既存未追跡`app/doc/`は保持。commit/push/deployは未実施。Technology LearningはType 1（既存の正本・revision・回復可能性の適用）で共通基盤の変更なし。Vault文書の更新は本作業の書込み対象外とし、このrepositoryに実装・残課題を記録した。

## 認証更新後の再開・本番反映承認資料

### バックアップと復元検証（2026-10-28 14:49–14:52 JST）

- 本番`live-setlist-prod`のSQL export成功。`outputs/sync-20261028/cloud-resume.sql`、59,472 bytes。
- SHA256: `ddf55157bb1061c3579cb151854d1527cc5c59c5941eba262c6553afcc8b4585`。
- 隔離SQLiteへの実復元、`integrity_check=ok`、`foreign_key_check`違反0。
- 本番と異なる専用DB ID／設定／保存先でローカルD1への実復元成功。SQLite復元・ローカルD1読戻し・本番SELECTを全6テーブルの全行hashで比較し一致。
- 本番SQLファイル実行は行データを返さないため検証に使わず、同じSELECTを`--command --json`で取得して全行照合した。本番に復元・UPDATE・INSERT・DELETE・migrationは実施していない。
- テーブル件数: `d1_migrations=2`、`planner_migrations=1`、`planner_state=1`、legacy `setlists/songs/setlist_songs=0`。
- Planner: v2 / revision 30、公演12、楽曲131、出演16、曲順131、抽選round4。document SHA256: `a179f8415090583df5f0e3d584b21f5bdff247cb1456b4967a61ef8f93b67011`。
- アプリの`loadPlannerStore`検証成功。重複ID・参照切れ0、performance内のposition順・一意性を確認。過去revision 21の値は今回の基準として使用しない。
- SQL・復元DB・実データJSONはignored `outputs/`に保持し、Gitへ含めない。証拠は`backup-verification.json`と`restore-comparison.json`、後続比較用Cloud JSONは`cloud-state.json`。

### 今回承認を求める範囲

- 対象: `https://live-setlist-app.garage-lab.workers.dev/`のWorker `live-setlist-app`と配信assets。
- Runtime変更: `app/SetlistDashboard.tsx`と`app/api/planner/route.ts`。旧端末の自動import／追加import POSTを停止し、原文exportを提供する。通常のGET／revision付きPUTは維持。
- 影響: 旧クライアントの移行POSTは405となる。旧端末情報は端末内に残る。PC/iPhoneを再読み込みするとCloudを読む。オフライン編集や自動mergeは追加しない。
- データ保全: D1 bindingは既存IDを維持。schema、seed、migration、既存のCloud内容とlocalStorage、Archive 18公演813 tracksは変更しない。DB統合・端末固有情報の採否は今回承認に含めない。
- ローカル準備: Security Gate（lint/typecheck/build/unit40件/audit）PASS。Archive audit PASS。`wrangler deploy --dry-run`成功、既存DB bindingのみ、Worker migrationsなし。既存のVite設定・sourcemap警告は継続。
- 再開後のブラウザ回帰: 隔離fixture用ローカルD1／モック通信で20/20 PASS。本番データの復元先とは別領域を使用。Runtime追加修正なし。
- 反映前の匿名GETはRoot／`/api/planner`／`/api/setlists`で全てAccessへの302。これは認証済みAPIの動作検証ではない。
- 本番反映前にCloudのrevision／document／全テーブルhashとWorker現行version、承認対象ファイル／配信artifactのhashを再確認。不一致なら反映せず再評価する。必要なら新しいバックアップと復元確認を取得する。
- commit/pushは承認対象外。実行するdeployはビルド済みWorkerとassetsのコードのみ。本番DBへのwriteをテストのために実行しない。

### ロールバックと反映後検証

- 読み取った現行の100%配信version: `a2a4a228-23d1-4d04-9a5a-eff500ec716e`。本番反映前にも一致を再確認する。
- コードのみの復旧コマンド: `npm.cmd exec wrangler -- rollback a2a4a228-23d1-4d04-9a5a-eff500ec716e`。DB／localStorageの復元や削除は行わない。
- 旧版へのrollbackでは旧端末importが復活する。復旧時は端末編集・移行操作を止め、データを保持して次の修正を判断する。DB復元は別承認。
- 承認後はdeploy結果のversion確認、匿名Access拒否、認証済みGET／画面／原文export（利用可能な本人sessionの範囲）、POSTの405を確認する。認証済みsessionが利用できなければ認証を迂回せず、その項目をユーザー確認待ちとする。
- デプロイ前後で全テーブルとPlanner document/revisionの不変を検証する。iPhoneで同じURL・同じ利用形態からJSONを保存し、その後Cloudとの差分と48件の分類へ進む。
- この承認待ち段階ではdeploy後smoke・iPhone export・48件分析は未実施。Culture Logは実装しない。

## 最終補正の準備（2026-10-28）

- コードとassetsはWorker `edd142d1-9f3c-438b-a19d-fa1aa61b1ff4`へ反映済み。反映前後のCloud全6テーブルは不変。旧iPhone原文JSONを取得し、48件（公演3件・楽曲45件）の同一ID差分を再現した。端末固有の公演・楽曲・出演・曲順は0。
- 本人確認によりCloudの41件のplaylist状態、4件の曲名修正、2件の公演補完を維持する。ブクロックフェスティバル（ID `event_66397f9b-a47d-4363-b7a5-566bfb080099`、2027-02-11）はconfirmedを維持し、既存分類festivalを採用することが追加確認で確定した。
- 現在もCloudはrevision30、公演12・楽曲131・出演16・曲順131。保全済みbackupと全行一致。eventType `one_man -> festival`だけの業務差分を準備し、revisionとCloud監査metadataの付随更新を含めて本番書込み承認を求める段階。公演内updatedAt、status、楽曲、関連付け等は変更しない。
- 隔離SQLite／新規ローカルD1で補正と狭い逆更新、全差分、古いrevision・原文不一致・二重実行拒否を検証済み。unit/API40件、Archive18公演813tracks監査もPASS。アプリ実装と配信artifactは不変。本番DBの書込み・再deployは未実施。
- 個別の本番DB承認・補正実行・実PC/iPhone表示一致が残るため、同期問題の最終クローズは未達。Culture Log Phase 1はまだ開始しない。
- 詳細な私的データ分析はignored `outputs/sync-20261028/iphone-analysis.md`、今回の修正・復旧・検証計画は`outputs/sync-final-20261028/approval-plan.md`。SQLや実データJSONをGitへ含めない。

## 本番補正実行結果（2026-10-28）

- 本人の明示承認後、直前revision30と全6テーブルの元データ完全一致、SQL／backup hashを確認し、承認済みの条件付きUPDATEを1回実行した。
- 対象 `event_66397f9b-a47d-4363-b7a5-566bfb080099`（ブクロックフェスティバル、2027-02-11）の業務変更はeventType `one_man -> festival`だけ。参加状態confirmedと公演内updatedAtを維持。Cloud revision31と監査metadata更新を確認した。
- 全6テーブル読戻し検証PASS。他の業務データは全て不変、公演12・楽曲131・出演16・曲順131。schema、重複ID0、曲参照切れ0、曲順、ランキング／参戦集計、Archive元ファイルと旧iPhone exportのhashもPASS。異常がないため逆更新は実施していない。
- Worker `edd142d1-9f3c-438b-a19d-fa1aa61b1ff4`は100%配信で不変。匿名Root／両APIのAccess302を確認。code deploy、migration、seed、commit、pushは行っていない。
- 48件の採用方針は確定・反映済み、iPhone固有の未移行データ0。技術対応は完了したが、実PC/iPhoneの最終表示一致は未確認につき、最終クローズとCulture Log Phase 1着手判断はユーザー確認待ち。
- 証拠と最終確認手順はignored `outputs/sync-final-20261028/execution-result.md`、全差分検証は`execute-post-verification.json`、schema等の検証は`final-validation.json`に記録。検証済み現行JSONは`cloud-revision31.json`。
