# Live Setlist App

ライブのセットリストを管理し、過去の公演を横断して「どのアーティストや曲をよく聴いているか」を可視化できるアプリです。

## 概要

- 公演一覧から各公演の詳細をモーダルで確認
- セトリの閲覧とダッシュボードをタブ切り替えで利用
- 収集したセットリストからアーティスト構成比と曲ランキングを集計
- 初期移行データを基準にした、実データ寄りの表示を優先
- Cloudflare D1 と共存しつつ、ローカルの JSON からも読み取れる構成
- Cloudflare D1 に、今後のライブ・抽選・参戦後セトリ・プレイリスト候補を保存

## 主な技術

- Next.js / React / Vinext
- Archive JSON bundled with the application
- Wrangler for Cloudflare deployment
- archive JSON under `初期移行データ/` as the canonical runtime dataset

The deployed product is intentionally read-only. `GET /api/setlists` reads the archive; `POST`, `PUT`, and `DELETE` return `405 Method Not Allowed`. See `docs/data-consistency.md` before reintroducing editing or reconciling the legacy D1 data.

The planning UI uses authenticated D1 storage with optimistic revision checks. The old `live-setlist-planner:v1` browser value is preserved recovery evidence only. It can be exported without modification; automatic and reviewed browser imports are disabled (`POST /api/planner` returns 405). See [Cloud authority and recovery](docs/cloud-authority.md).

Archive and seed imports are validated before use. Unknown schema versions, malformed/null songs, missing artists, duplicate source song IDs or positions, and mismatched setlist references are rejected or excluded with reason codes. This detection does not select an archive/D1 source of truth or repair data automatically.

## 使い方

### ローカル開発

```bash
npm install
npm run dev
```

### ビルド確認

```bash
npm run build
```

### テスト

```bash
npm test
npm run security:gate
```

`/api/planner`のJSON bodyは1 MiBまでで、Content-Type、実受信bytes、document schemaをServer Sideで検証します。Security Gateはlint、typecheck、unit/security test、dependency auditを実行し、High以上が残る場合は失敗します。

### Cloudflare へデプロイ

```bash
npm run build
npx wrangler login
npm run deploy
```

`wrangler.jsonc` declares the D1 binding, but remote migration and Production deployment remain Human Approval actions. Cloudflare Access must protect the entire Worker route space before activation.

## データソース

Culture Log Phase 1 adds a Cloud-only watchlist for music, films, exhibitions, books and theatre. See [watchlist design, validation and release procedure](docs/culture-log-phase1.md). Production activation requires approval for the additive `0002_culture_watchlist.sql` migration and deployment; local implementation does not activate Production.

楽曲選択・登録不可・曲名修正・明示統合とPlanner v2の互換性／リリース手順は[楽曲管理](docs/song-management.md)を参照してください。

- Historical Archive reads use `初期移行データ/`.
- Mutable Planner reads/writes use D1 through `/api/planner`.
- Browser localStorage and UI state are not authoritative after migration.
- A device with old local data receives an export panel. Local data never initializes or updates Cloud automatically, including when Cloud is empty.
- 公演別の集計とランキングは、実データに基づいて再計算される前提です

## ディレクトリの見どころ

- `app/SetlistDashboard.tsx` : ダッシュボードと公演詳細の UI
- `app/api/setlists/route.ts` : archive read API and explicit write rejection
- `db/schema.ts` : legacy Archive tables plus the additive Cloud Planner state and migration-ledger tables

CI-friendly checks are `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run build`. `npm test` intentionally includes a production build before the Node test suite; do not run both `npm test` and a separate build in the same CI job unless duplicate build coverage is desired.
- `wrangler.jsonc` : Cloudflare deploy config
- `初期移行データ/` : 公演データの移行元

## バージョン

- v1.0.0
- GitHub と Cloudflare への公開前提で整理した初期版です

## ライセンス

未設定です。公開前に必要に応じてライセンスを追加してください。
