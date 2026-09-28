# Live Setlist App Project Design

## Context

```yaml
Product: Live Setlist App
Primary User: 自分自身
Primary Device: Mobile
Primary Task: ライブ参加履歴、曲、アーティスト構成比を楽しく確認する
Secondary Tasks: 公演詳細とSetlistを見る、Song Rankingを比較する、曲を記録する
Information Density: Medium
Primary Design Profile: Data Dashboard / Analytics
Secondary Design Profile: Consumer App
Tone: Music / Casual / Archival
Accent: 既存のwarm accent。chart category色とは役割を分ける
Dark Mode: No（現状）
Special Requirements: 円グラフ、Artist構成比、Song Ranking、Setlist、長い公演名、Mobile操作
Existing Design Source of Truth: app/globals.css and app/SetlistDashboard.tsx
```

## Design priority

Data Visualization、視認性、音楽サービスらしい体験を優先します。数字やランキングは装飾ではなく、参加履歴から傾向を理解するための主役として扱います。

## Hierarchy contract

- Primary: Artist構成比、Song Ranking、選択した公演のSetlist
- Secondary: 集計期間、比較値、公演metadata、chart legend
- Tertiary: 補足説明、入力支援、更新状態
- Deferred: 詳細編集、低頻度設定、集計定義の長い説明

## Profile boundaries

PrimaryのData Dashboard / Analyticsを、集計、chart、ranking、比較、注釈の基準とします。SecondaryのConsumer AppはMobile navigation、tap target、操作feedback、音楽体験のtoneなど、個人的で日常的な利用体験が主目的となる範囲だけに適用します。

Consumer Appの表現を理由なくcolorful、gradient、animationへ結び付けません。Secondaryを使う場合は対象と理由を説明し、分析情報の可読性を弱めません。

## Visual decisions

- Layout: Mobileではinsight、chart、ranking、detailの順にstackする。
- Navigation: Setlistと分析の現在地を明示し、Mobileで主要destinationへ短く到達させる。
- Typography personality: 数値とrankingを比較しやすくし、公演名とArtist名の階層を明確にする。
- Color personality: warm neutral + accent。chart系列色はcategory identityとcontrastを優先する。
- Data visualization: 円グラフは少数categoryの概況に限定し、Artist比較はlabelやrankingを併用する。
- Component composition: chart、ranking table/list、Setlist、metadataを役割別に構成する。
- Visual rhythm: 分析領域は比較しやすく密度を保ち、公演詳細は読みやすく区切る。

## Required data roles

- 円グラフ / Artist構成比: denominator、category、percentage、件数、legendを理解できるようにする。
- Song Ranking: 順位、曲名、Artist、回数を比較可能にする。
- Setlist: 曲順とArtistの関係を保持し、単なるCard gridにしない。
- 集計には期間、定義、空データ、loading、errorを用意する。

## Responsive behavior

| Range / condition | Strategy |
| --- | --- |
| Mobile | chartとrankingをstackし、hoverに依存せずtap / focusで詳細を得られるようにする。 |
| Tablet | chartとrankingの並列表示を、labelが衝突しない場合だけ許可する。 |
| Desktop | comparisonとdetailを並べられるが、KPI Cardの大量配置にはしない。 |

## Existing-system note

既存CSSのwarm palette、gradient、large radius、shadowは現行実装の一部です。本作業では変更しません。将来その箇所を変更する際にAnti AI SlopとQuality Gateで目的を再確認し、Design Systemを理由に無関係な全面改修は行いません。

## Rule priority

1. Project固有の明示的Product Requirement
2. この`PROJECT_DESIGN.md`
3. Data Dashboard / Analytics、理由を記した範囲のConsumer App
4. Core Design Foundation
5. AIの一般的判断

Accessibilityまたは重大なUX問題は、上位要件に由来していても警告し、解決案を提示します。

## Feedback loop

- Project固有の判断はこの文書へ記録する。
- 複数Projectで再利用できる改善はDesign System改善候補として報告する。
- Project作業から`C:\dev\design-system`を直接変更しない。
