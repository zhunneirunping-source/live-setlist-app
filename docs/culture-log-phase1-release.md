# Culture Log Phase 1 本番反映前確認 — 2026-10-28

状態: **PREDEPLOY_HOLD**。本番migration、deploy、commit、pushは未実行。利用者による本番反映の条件付き承認は有効だが、候補コードのCI Secret scan完了条件を満たしていない。

## 確認結果

| Gate | 結果 |
| --- | --- |
| CI Secret scan | HOLD — 実装は未コミット。remote mainは`da433bc`、local HEADは`49b0069`。既存runは今回のコードを含まないため代用しない |
| 本番baseline | PASS — revision 31、公演12・楽曲131・出演16。quick_check ok、FK違反0 |
| Backup restore | PASS — 新しいSQL exportをSQLiteおよび隔離ローカルD1に復元。SQLite integrity_check ok、runtime Planner validation成功 |
| Migration | PASS — 復元コピーへ0002を2回適用。既存6テーブルのschema / content hash保持、新規空テーブルだけ追加 |
| Access | 部分PASS — `/`, `/api/planner`, `/api/setlists`, `/api/watchlist`は未認証302でAccess loginへ転送。認証済み画面・policy設定のlive確認は未実施 |
| revision方針 | PASS — 専用revision、CAS UPDATE、初回INSERT競合保護。今回再実施したwatchlist unit/API 3件PASS |

現行Worker: `edd142d1-9f3c-438b-a19d-fa1aa61b1ff4`（事前read-only確認）。pending migrationは`0002_culture_watchlist.sql`だけ。

バックアップ: `outputs/culture-release-20261028/production-before.sql`（Git対象外、59,485 bytes）。SHA-256: `6e27b2507a7495cc95ce2f1d8293ba2244b3555902cbcf234239c64d78c9e16a`。

復元結果: `outputs/culture-release-20261028/restore-verification.json`、SQLiteコピー`restored.sqlite`、隔離D1は`.wrangler/culture-release-restore`。ローカル専用bindingには実在しない隔離IDを使用し、本番へrestoreしていない。

本番変更前後比較は未実施（変更自体が未実行）。本番読み取りのrows_written / changesは0。Backup取得時にWranglerが一時download URLをstdoutへ出したため、今後のexport出力は捕捉・redactする。URLは文書・manifestへ保存しない。

## CIへ進むための承認対象

`release/culture-log-phase1-20261028`専用branchへ、今回の候補manifestに記載するファイルだけをcommit / pushし、既存Security Gateをworkflow_dispatchで実行する。remote mainへのpush / mergeは行わない。無関係な`app/doc/reviews/live-setlist-app_20260928.pdf`と、全outputs / DB backup / credentialsはcommitしない。

理由: AGENTS.mdの「利用者の明示指示なしにcommit、push、deploy、本番DB変更を行わず」に従う。今回の指示は本番migration / deployを条件付き承認しているが、Git commit / pushは明示されていない。

既存CI run `40141816096`ではSecret scan step自体は成功、全体は旧dependency auditで失敗していた。旧runは今回の候補の合格証拠には使わない。新しい候補で全Gateを確認する。

## 認証済み検証と実機手順

Computer UseはWindowsで現在のbrowser URLを十分な確度で特定できず、このturnのUI操作を停止した。ブラウザ認証情報の取得・Access回避は行っていない。CIと認証済み検証経路が整うまで本番反映を再開しない。

反映後のPC / iPhone確認は、同じアプリURLで認証し、次を行う。

1. PCで5ジャンルが選択できることを確認し、識別できるダミー対象を登録。iPhoneで再読込し、同じ名前・重要度を確認。
2. iPhoneで名前・重要度を編集。PCで再読込して一致を確認。
3. 同一ジャンル・同一名の追加が拒否されることを確認。
4. ライブ参戦履歴候補を1件だけ選択し登録。自動登録されず、登録後は候補から消えることを確認。実際のwatch対象は利用者の判断で残す。
5. ダミー対象の解除を確認し、両端末で再読込して消えることを確認。
6. 既存のライブ・セトリ・抽選状態・集計が従来と一致することを確認。既存ライブをテストのために変更しない。

Phase 1はまだclose不可。残りは候補CI、認証済み確認経路、本番反映と前後比較、PC / 実機iPhone確認。
