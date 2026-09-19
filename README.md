# Live Setlist App

ライブのセットリストを管理し、過去の公演を横断して「どのアーティストや曲をよく聴いているか」を可視化できるアプリです。

## 概要

- 公演一覧から各公演の詳細をモーダルで確認
- セトリの閲覧とダッシュボードをタブ切り替えで利用
- 収集したセットリストからアーティスト構成比と曲ランキングを集計
- 初期移行データを基準にした、実データ寄りの表示を優先
- Cloudflare D1 と共存しつつ、ローカルの JSON からも読み取れる構成

## 主な技術

- Next.js / React / Vinext
- Cloudflare D1 + Drizzle ORM
- Wrangler for Cloudflare deployment
- archive JSON under `初期移行データ/` as the canonical imported dataset

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

`wrangler.jsonc` に D1 バインディングが設定済みのため、Cloudflare に対してそのまま公開可能です。

## データソース

- 実運用では D1 から取得
- 取得できない場合は `初期移行データ/` の JSON をフォールバックとして利用
- 公演別の集計とランキングは、実データに基づいて再計算される前提です

## ディレクトリの見どころ

- `app/SetlistDashboard.tsx` : ダッシュボードと公演詳細の UI
- `app/api/setlists/route.ts` : D1 / JSON の取得ロジック
- `db/schema.ts` : setlists, songs, setlist_songs のスキーマ
- `wrangler.jsonc` : Cloudflare deploy config
- `初期移行データ/` : 公演データの移行元

## バージョン

- v1.0.0
- GitHub と Cloudflare への公開前提で整理した初期版です

## ライセンス

未設定です。公開前に必要に応じてライセンスを追加してください。
