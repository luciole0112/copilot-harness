# GitHub Copilot Harness

GitHub Copilot で、変更のリスクに応じて調査・実装・レビューの深さを選び、実行した検証結果を残すための汎用テンプレートです。Git と Node.js 24 が必要です。コアスキルは同梱済みです。

## 新しいリポジトリで使う

ZIP を展開して `copilot-harness` に移動します。展開直後は `git init` を実行してください。

```sh
git init
node scripts/harness.mjs bootstrap
node scripts/harness.mjs doctor
node scripts/harness.mjs verify --mode deep
```

内容を Git に登録し、必要に応じて自分の GitHub リポジトリへ push します。GitHub の Settings で **Template repository** を有効にすると、以降は **Use this template** で複製できます。VS Code では Copilot セッションのエージェント選択から `orchestrator` を選べます。Copilot CLI ではルートから `copilot` を起動し `/agent` で選択します。

依頼例は「この変更を Quick / Standard / Deep に分類し、理由と受け入れ条件を示したうえで実装して。実行したテストを報告して」です。

## 既存プロジェクトに追加する

テンプレート側から実行します。対象には既存のブランチまたは作業コピーを用意してください。

```sh
node scripts/harness.mjs bootstrap --target "../my-project"
node scripts/harness.mjs bootstrap --target "../my-project" --skip-existing
node scripts/harness.mjs bootstrap --target "../my-project" --skip-existing --apply
```

既定はプレビューです。異なる同名ファイルがあれば停止します。`--skip-existing` は既存ファイルを保持し、手動で統合するパスを表示します。既存の `AGENTS.md`、`.gitignore`、`.gitattributes`、Copilot instructions、Hooks、品質プロファイルやワークフローは適用後に照合してください。特に同梱スキルの LF と固定ハッシュを維持する `.gitattributes`、MCP とローカルログ等の除外設定を統合します。`--apply` は新規ファイルだけを作成します。適用後は対象ルートで `doctor` と `verify` を実行し、追加差分をレビューします。

## 作業モードとエージェント

| モード | 用途 | 完了の証拠 |
|---|---|---|
| Quick | 影響が限定された軽微な変更 | 差分と対象チェック |
| Standard | 通常の機能、障害修正、可逆的な設計変更 | 受け入れ条件、回帰テスト、差分レビュー |
| Deep | 認可、移行、公開契約、複数境界、影響不明 | ADR／仕様、移行・復旧条件、独立レビュー、全ゲート |

ルールは [Workflow Router](.github/skills/workflow-router/SKILL.md) にあります。orchestrator が必要な役割を選びます。architect と reviewer は読取中心、developer は実装、qa は実行検証、docs は資料作成を担当します。Project Memory は [用語・仕様・ADR・手順・計画・教訓の案内](docs/memory.md) からたどれます。

## 固定スキルとライセンス

| 配布元 | 採用する役割 | ライセンス |
|---|---|---|
| Superpowers | `test-driven-development`、`systematic-debugging`、`verification-before-completion` | MIT |
| Matt Pocock | `grill-with-docs`（`grilling`、`domain-modeling`）、`improve-codebase-architecture`（`codebase-design`）、`to-spec`、`to-tickets`、`handoff`、`retro` | MIT |
| Anthropic | `docx`、`pdf`、`pptx`、`xlsx`（任意） | Apache-2.0 |

計画は Router、レビューは reviewer、TDD とデバッグは Superpowers に割り当てました。上流プラグインの起動スキルや競合する `tdd`、`diagnosing-bugs` は導入対象から外しました。Matt の仕様とチケットはローカル Markdown に保存する構成です。一部の Matt スキルはクライアント上でユーザーによる明示呼び出しが必要です。

`skills-lock.json` に配布元・40桁コミット・個別ファイルの SHA-256 とライセンスを記録しています。スキル本体と添付ファイルは上流のバイト列を保ち、MIT 本文を各スキルに添えています。次のコマンドは確認済みコミットを Git で取得し、ハッシュを照合して欠損ファイルを復元します。内容が異なるファイルは安全のため競合として停止します。

```sh
node scripts/harness.mjs fetch-skills core
```

Office は必要な場合に、[該当コミットのスキル別ライセンス](https://github.com/anthropics/skills/tree/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills) と各スキルの実行依存を確認してから導入します。取得後のファイルは標準の Git 除外対象です。

```sh
node scripts/harness.mjs fetch-skills office --accept-office-license
node scripts/harness.mjs doctor --office
node scripts/harness.mjs verify --mode deep --office
```

更新担当者は上流をレビュー対象のコミットで取得し、`node scripts/lock-skills.mjs <superpowers-clone> <matt-clone> <anthropic-clone>` でロックを生成します。新しいロックはクリーンな作業コピーでコアの旧ディレクトリを退避してから取得し直し、差分・添付ライセンス・検証をレビューします。配布元は [Superpowers 固定ツリー](https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7) と [Matt Pocock 固定ツリー](https://github.com/mattpocock/skills/tree/d65391149dbb5fe76478e76fa8d5122b2aa5a70e) です。

## Hooks と任意 MCP

| 環境 | Hooks | MCP の設定例 |
|---|---|---|
| VS Code の Copilot セッション、Copilot App | `.github/hooks/harness.json` | VS Code は [例](examples/mcp/vscode.json) の `servers` を `.vscode/mcp.json` に統合 |
| Copilot CLI | 同じ共有 Hooks | 組み込み GitHub MCP を優先。任意の [例](examples/mcp/copilot-cli.json) はローカル `.mcp.json` またはユーザーの `mcp-config.json` に統合 |
| GitHub Copilot cloud agent | 既定ブランチの共有 Hooks。Linux の Node.js 24 はセットアップ Workflow で用意 | 組み込みの読取用 GitHub MCP を優先。追加する場合は [例](examples/mcp/cloud.json) を GitHub のリポジトリ MCP 設定で使用 |
| VS Code の旧 Local ハーネス | [旧形式の例](examples/hooks/vscode-legacy.json)。旧 Local 用に共有 Hooks と入れ替える場合のみ有効化 | VS Code の MCP 設定に従う |

Hooks は Git 環境の確認、代表的な破壊操作・保護対象の直接編集に対する簡易ガード、終了時の差分チェックを行います。権限設定、リポジトリルール、必須 CI と併用します。ガードには対象外の構文・ツールがあり、タイムアウト時はクライアントの通常権限フローに戻ります。`HARNESS_AUDIT=1` で任意の監査ログを有効化すると `.harness-local/events.ndjson` に時刻とイベント種別だけを記録します。Cloud のディスクは一時的です。フォーマットやプロジェクトのテストは明示的な品質ゲートで実行し、Hook は作業ファイルの自動整形や公開を行いません。

MCP は初期状態で追加接続しません。GitHub の例は読取専用です。CLI の追加サーバーを利用する場合は README と設定例にあるトークン名を利用環境で設定し、実値は共有ファイルに書かないでください。Cloud の例を利用する場合は Agents 環境に `COPILOT_MCP_GITHUB_TOKEN` シークレットを登録します。必要時のみ [Context7](https://github.com/upstash/context7)、[Playwright MCP](https://github.com/microsoft/playwright-mcp) を追加し、接続先とツール権限を絞ります。

仕様は 2026年11月25日に確認しました。[GitHub Hooks](https://docs.github.com/en/copilot/reference/hooks-reference) · [VS Code Hooks](https://code.visualstudio.com/docs/agent-customization/hooks) · [Custom Agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration) · [CLI MCP](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) · [Cloud MCP](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers)

## 言語別品質ゲートと CI

`harness.config.json` の `profiles` に対象プロファイルを選びます。標準の `harness` はテンプレート自体を検証します。複数選択できます。ツールとロック済み依存を対象プロジェクトの通常手順で事前導入し、CI の検証ステップ前にも同じ手順を追加します。実行するコマンドは [プロファイル定義](config/profiles.json) にあります。必要なコマンドが失敗した場合はゲートも失敗します。

| プロファイル | Quick | Standard で追加 | Deep で追加 |
|---|---|---|---|
| typescript | npm lint | npm typecheck、test:ci | npm build |
| python | Ruff | Pyright、pytest | PyPA build |
| java | Maven validate | Maven test | Maven verify |
| dotnet | dotnet format | dotnet test | Release build |
| go | go vet | go test | go build |
| rust | rustfmt | Clippy、cargo test | Release build |

全モードで固定スキル、Git 差分の空白、簡易秘密パターン、Harness テストを確認します。簡易スキャンの対象は Git 登録・未追跡の小さなテキストと変更したステージ内容です。履歴や任意形式の秘密検出には、プロジェクト側で専用スキャナーを設定してください。PR・push の GitHub Actions は Linux・Windows・macOS のマトリクスで Deep を実行します。CI のゲートをマージ条件にする場合は GitHub のルールセットで各 Verify チェックを必須化してください。

## 評価と検証状況

[評価手順](evals/README.md) はルーティングの自動テストと、自然文を用いた Copilot の導入前後比較を定義しています。実行済みと未検証の範囲は [検証記録](docs/verification.md) を参照してください。
