# Culture Log Phase 1 本番反映前確認 — 2026-10-28

状態: **DEPLOYED_AWAITING_AUTHENTICATED_DEVICE_CHECK**。利用者の条件付き本番反映承認と、専用branchへのcommit / push承認に従い、全事前Gate成功後にmigrationとdeployを実施した。認証済み本番CRUD・既存機能smoke・PC / 実機iPhoneの最終確認は未完了。

- 本番コードcommit: `ed8ee586704df2cff9d4ae7d53cc334940d143cc`
- branch: `release/culture-log-phase1-20261028`
- [本番コードのSecurity Gate](https://github.com/zhunneirunping-source/live-setlist-app/actions/runs/40646551385): fast-gate / deep-gateともsuccess。Gitleaks stepはsuccess・未スキップ。head SHA一致をデプロイ直前にも再確認した。
- Worker version: `cf6d089c-56f8-4af5-a70e-19bae2619c4d`（100%）。旧version `edd142d1-9f3c-438b-a19d-fa1aa61b1ff4`。
- migration: `0002_culture_watchlist.sql`適用済み。新規テーブルは削除していない。異常は検出されず、rollbackは未実施。
- remote mainは`da433bc939c1779005afbb958e623b0f42771e3e`のまま。mainへのpush / merge / PR自動mergeは行っていない。

## 確認結果

| Gate | 結果 |
| --- | --- |
| CI Secret scan | PASS — 上記runの候補SHAとGitleaks step successを検証。旧runは代用していない |
| 本番baseline | PASS — revision 31、公演12・楽曲131・出演16。quick_check ok、FK違反0 |
| Backup restore | PASS — 新しいSQL exportをSQLiteおよび隔離ローカルD1に復元。SQLite integrity_check ok、runtime Planner validation成功 |
| Migration | PASS — 復元コピーへ0002を2回適用。既存6テーブルのschema / content hash保持、新規空テーブルだけ追加 |
| Access | 未認証境界PASS — 反映前後の4 URLは302でAccess loginへ転送。反映後のwatchlist GET / PUTも未認証302。認証済み操作・policy設定のlive確認は未実施 |
| revision方針 | PASS — 専用revision、CAS UPDATE、初回INSERT競合保護。今回再実施したwatchlist unit/API 3件PASS |

事前Workerは旧versionと一致。pending migrationが`0002_culture_watchlist.sql`だけであることを確認してから適用した。

バックアップ: 初回事前確認`outputs/culture-release-20261028/production-before.sql`、CI成功後の直前取得`production-release-before.sql`（いずれもGit対象外、59,485 bytes）。両方のSHA-256は`6e27b2507a7495cc95ce2f1d8293ba2244b3555902cbcf234239c64d78c9e16a`で一致した。

復元結果: `outputs/culture-release-20261028/restore-verification.json`、SQLiteコピー`restored.sqlite`、隔離D1は`.wrangler/culture-release-restore`。ローカル専用bindingには実在しない隔離IDを使用し、本番へrestoreしていない。

CI後のexportを改めてSQLiteへ復元し、全6テーブルの本番SELECT結果と一致、integrity_check / foreign_key_checkが正常であることも確認した。復元コピーへのmigration適用で既存データを保持した。

## 本番DB前後比較

| 項目 | 反映前 | migration後 / deploy後 |
| --- | --- | --- |
| Planner revision | 31 | 31 |
| 公演 / 楽曲 / 出演 | 12 / 131 / 16 | 12 / 131 / 16 |
| Planner document SHA-256 | `df7234d1474eca9d47d3a87ed9739e3bfc9fcbda2b15cd71eaf2308c0d0cfb3d` | 一致 |
| 既存アプリ5テーブル | 既存baseline | schema・全行hash一致 |
| migration台帳 | 2件 | 3件（既存2行保持・0002 receiptだけ追加） |
| watchlist_state | 未作成 | 作成済み・0行（登録前） |
| DB quick_check / FK違反 | ok / 0 | ok / 0 |

証拠はGit対象外の`outputs/culture-release-20261028/release-preflight.json`, `release-migration.json`, `release-postdeploy.json`と各tables snapshotに保存。SQLやsnapshot本文、credentialsをcommitしていない。Backup初回取得でWranglerが一時download URLをstdoutへ出したため、直前取得では出力を捕捉しURLを保存・表示しなかった。

## Candidate / tests / safety

元manifestの27ファイルすべてが一致し、tracked差分に未記載fileがないことを確認した。レビュー後の修正はREADMEの重複説明1段落の除去だけ。更新manifestとindexを再照合し、27ファイルだけをcommitした。既存のCloud正本化変更は前提として保持し、無関係な`app/doc/reviews/live-setlist-app_20260928.pdf`は未追跡のまま保持している。

公式Gitleaks v8.30.1をchecksum検証して使用。候補27ファイルのdirectory scanと、commit後の12コミットのhistory scanは検出0件。実行ファイル・report・backupはGit対象外。local Security Gate（lint / typecheck / build / unit API 43件 / dependency audit）PASS。実装時のPlaywright 30件PASS（実ローカルD1の2端末context共有・409を含む）。本番の認証済み操作の代用にはしていない。

## 認証済み検証と実機手順

前回Computer UseはWindowsで現在のbrowser URLを十分な確度で特定できず停止した。今回の接続再確認でもbrowser access hostはunavailableだった。ブラウザ認証情報の取得・Access回避は行っていない。このため、本番CRUDと既存ライブ・セトリ・抽選・集計の認証済みsmokeはユーザー確認待ち。確認できたデプロイ・DB保持・未認証拒否と区別する。

反映後のPC / iPhone確認は、同じアプリURLで認証し、次を行う。

1. PCで5ジャンルが選択できることを確認し、識別できるダミー対象を登録。iPhoneで再読込し、同じ名前・重要度を確認。
2. iPhoneで名前・重要度を編集。PCで再読込して一致を確認。
3. 同一ジャンル・同一名の追加が拒否されることを確認。
4. ライブ参戦履歴候補を1件だけ選択し登録。自動登録されず、登録後は候補から消えることを確認。実際のwatch対象は利用者の判断で残す。
5. ダミー対象の解除を確認し、両端末で再読込して消えることを確認。
6. 既存のライブ・セトリ・抽選状態・集計が従来と一致することを確認。既存ライブをテストのために変更しない。

Phase 1のコード・本番反映は完了。最終closeは認証済み操作とPC / 実機iPhoneの確認後に判定する。既存DBをテスト目的で書き換えず、不具合があれば旧Workerへコードrollbackし、watchlist_stateは保持する。
