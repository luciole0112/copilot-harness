---
name: workflow-router
description: "GitHub Copilot の変更タスクを Quick、Standard、Deep に振り分け、検証と利用スキルを選ぶ。"
---

# Workflow Router

入力は変更の目的、受け入れ条件、影響範囲。未確定事項はコードと既存文書から確認する。制約と要求が衝突した場合は着手前に解消する。

| モード | 条件 | 手順 |
|---|---|---|
| Quick | 対象が限定され、振る舞いと契約への影響が小さい | 確認 → 修正 → 対象チェック |
| Standard | 通常の機能、原因調査が必要な不具合、可逆的なリファクタリング | 受け入れ条件 → 小さな実装計画 → 回帰テスト → 実装 → 差分レビュー → 検証 |
| Deep | 認可・秘密管理・移行・互換性・公開契約・不可逆操作・複数境界への影響、または影響を絞れない変更 | 要件と影響調査 → ADR／仕様・ロールバック条件 → 段階計画 → 実装 → 独立レビュー → 全ゲート → 教訓 |

Deep 条件を最優先し、Quick の条件を満たさない通常変更は Standard とする。計画段階と実装中に再判定する。ユーザーが希望するモードも示し、重大なリスクがある場合は昇格を提案する。

- 計画は Router の手順に沿って簡潔に記述する。振る舞い変更は Superpowers の `test-driven-development`、原因不明のバグは `systematic-debugging`、完了確認は `verification-before-completion` を参照する。
- 要件の対話は Matt の `grill-with-docs`（補助 `grilling` と `domain-modeling`）、既存構造の改善は `improve-codebase-architecture`（補助 `codebase-design`）、仕様化と分割は `to-spec`、`to-tickets`。ユーザー呼び出し専用のスキルが必要なら名前を提示する。明示許可がなければチケットはローカルに置く。
- セッションをまたぐ場合は `handoff`。再発防止を検討する場合は `retro`。改善案は差分としてレビューする。
- 実行例は `node scripts/harness.mjs verify --mode quick`。Deep と CI は全段階を実行する。
