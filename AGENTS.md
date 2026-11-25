# 開発の進め方

1. [Workflow Router](.github/skills/workflow-router/SKILL.md) を読み、変更のリスクから Quick / Standard / Deep を選び、理由を一行で示す。リスクが判明した時点で昇格する。
2. 変更箇所の既存規約と [Project Memory](docs/memory.md) を確認する。受け入れ条件に対応する差分と検証を用意する。
3. `node scripts/harness.mjs verify --mode standard` を目安に、対象のゲートを実行する。最終報告には実行コマンド、結果、未実施項目と理由を記す。
4. 作業中の他者の変更を保護する。外部公開、Issue 作成、デプロイ、破壊的操作は明示された権限内で行う。認証情報や個人情報をリポジトリ、Hook ログ、Project Memory に保存しない。

## Agent skills

- Issue トラッカーは [ローカル Markdown](docs/agents/issue-tracker.md)。[ラベル語彙](docs/agents/triage-labels.md) と [ドメイン文書の配置](docs/agents/domain.md) を参照する。
- Router の手順と下位ディレクトリのプロジェクト規約を優先する。Superpowers のプラグイン専用の起動、サブエージェント、コミット指示は利用可能な機能とユーザーの承認範囲に合わせる。
