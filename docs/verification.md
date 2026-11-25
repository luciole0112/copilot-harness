# 検証記録

2026年11月25日。Windows、Node.js 24.22.1、Git 2.47.1.windows.2。

| 対象 | 結果 |
|---|---|
| 固定コミット取得 | GitHub の公式3リポジトリから取得。コア12スキルの44ファイルと Office 4スキルの184ファイルを SHA-256 照合 |
| 初期化・診断 | `bootstrap` と `doctor --office` が成功 |
| 自動検証 | `verify --mode deep --office` が成功。12件の自動テストが通過 |
| 配布 ZIP | 展開したコピーを Git 初期化し、外部スキルを取得せずに `bootstrap`、`doctor`、`verify --mode deep` を実行 |
| GitHub Actions | actionlint 1.7.12 で両 YAML を静的検証。GitHub-hosted runner での実行は未確認 |
| 導入保護 | プレビュー、衝突時の停止、既存ファイルを保持した導入、再実行、パス走査・ディレクトリリンクの拒否を確認 |
| Hooks テスト | 共有形式と旧 VS Code Local 形式の JSON をスクリプトに渡し、拒否と既定動作への委譲を確認 |
| 品質ゲート | モードの累積、失敗終了コードの伝播、作業ツリーとステージ内容の簡易秘密検出を確認 |

未検証は実際の Copilot セッションでのルーティング・スキル選択・Custom Agent 委譲・Hooks の発火、MCP 接続、GitHub Actions の実行、Linux／macOS 上の動作、6言語の実アプリを用いたゲート、Office ファイルの生成です。Copilot CLI はこの環境で起動できなかったため、自然文評価の成功率は計測していません。
