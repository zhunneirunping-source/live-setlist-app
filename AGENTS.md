# live-setlist-app 開発ルール

このファイルは`C:\dev\live-setlist-app`に適用する。作業前にGit rootと既存差分を確認し、利用者の変更を尊重する。利用者の明示指示なしにcommit、push、deploy、本番DB変更を行わず、secret、token、credentialを保存・出力しない。

## 共通AI Development Loop

開発依頼を受けた場合は、`C:\dev\knowledge\knowledge\90_System\AI_Development_Loop.md`を読み、Context Load、Planner、Implementer、Tester、Reviewer、必要な修正、Closeoutを1回の依頼内で実行する。Workflow本文はこのProjectへ複製せず、同文書を正本とする。本ファイルのProject固有ルールも併用し、より具体的または安全な制約を優先する。

## UI / UX / Frontend変更時のDesign System運用

UI、UX、Frontendを新規作成・変更する場合のみ、次の順序で確認する。

1. `README.md`、実装済みの要件、`PROJECT_DESIGN.md`でProject固有要件を確認する。
2. `C:\dev\design-system\core\`のFoundation、Tokens、Accessibility、Responsive、UX Principlesを確認する。
3. Primaryの`profiles/dashboard/DESIGN_PROFILE.md`を確認する。Mobile navigationなど`PROJECT_DESIGN.md`に理由を記した範囲だけSecondaryの`profiles/consumer-app/DESIGN_PROFILE.md`を併用する。
4. `C:\dev\design-system\rules\ANTI_AI_SLOP.md`を確認する。
5. `C:\dev\design-system\components\COMPONENT_RULES.md`を確認する。
6. `app/globals.css`、`app/SetlistDashboard.tsx`、近い既存componentを確認し、再利用、variant追加、新規作成の順で判断する。
7. `C:\dev\design-system\rules\AI_AGENT_UI_WORKFLOW.md`に従ってUIを実装する。
8. `C:\dev\design-system\rules\UI_QUALITY_GATE.md`でVisual Hierarchy、Information Architecture、Consistency、Anti AI Slop、Responsive、Accessibility、Interaction、Content、Unnecessary UIを自己評価する。

優先順位は、明示的なProduct Requirement、`PROJECT_DESIGN.md`、Primary Design Profile、Core Design Foundation、AIの一般的判断の順とする。Accessibilityまたは重大なUX問題は上位要件であっても警告する。Secondary Profileから都合のよい規則だけを拾わず、適用する画面またはcomponentと理由を説明する。Quality GateにFAILがあるUI変更は原則として完了扱いにしない。

Project固有の判断は`PROJECT_DESIGN.md`へ記録する。他Projectでも再利用できる改善は共通Design Systemの変更候補として報告し、このrepositoryから`C:\dev\design-system`を直接変更しない。
