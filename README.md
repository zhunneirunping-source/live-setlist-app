# Live Setlist App

ライブのセットリストを管理し、過去の公演を横断して「どのアーティストや曲をよく聴いているか」を可視化できるアプリです。

## 概要

- 公演一覧から各公演の詳細をモーダルで確認
- セトリの閲覧とダッシュボードをタブ切り替えで利用
- 収集したセットリストからアーティスト構成比と曲ランキングを集計
- 初期移行データを基準にした、実データ寄りの表示を優先
- Cloudflare D1 と共存しつつ、ローカルの JSON からも読み取れる構成
- ブラウザ内に、今後のライブ・抽選・参戦後セトリ・プレイリスト候補を保存

## 主な技術

- Next.js / React / Vinext
- Archive JSON bundled with the application
- Wrangler for Cloudflare deployment
- archive JSON under `初期移行データ/` as the canonical runtime dataset

The deployed product is intentionally read-only. `GET /api/setlists` reads the archive; `POST`, `PUT`, and `DELETE` return `405 Method Not Allowed`. See `docs/data-consistency.md` before reintroducing editing or reconciling the legacy D1 data.

The planning UI is local-first: mutable data is stored in the current browser profile under a versioned key and is merged with the bundled archive only for display and aggregation. It is not synchronized across devices and does not reopen the public API write surface.

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
```

### Cloudflare へデプロイ

```bash
npm run build
npx wrangler login
npm run deploy
```

`wrangler.jsonc` intentionally has no D1 binding. Production deployment remains a Human Approval action.

## データソース

- Runtime reads use `初期移行データ/` only.
- Runtime writes are disabled; update and validate archive JSON before a reviewed deployment.
- 公演別の集計とランキングは、実データに基づいて再計算される前提です

## ディレクトリの見どころ

- `app/SetlistDashboard.tsx` : ダッシュボードと公演詳細の UI
- `app/api/setlists/route.ts` : archive read API and explicit write rejection
- `db/schema.ts` : legacy D1 schema retained for read-only reconciliation work

CI-friendly checks are `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run build`. `npm test` intentionally includes a production build before the Node test suite; do not run both `npm test` and a separate build in the same CI job unless duplicate build coverage is desired.
- `wrangler.jsonc` : Cloudflare deploy config
- `初期移行データ/` : 公演データの移行元

## バージョン

- v1.0.0
- GitHub と Cloudflare への公開前提で整理した初期版です

## ライセンス

未設定です。公開前に必要に応じてライセンスを追加してください。
