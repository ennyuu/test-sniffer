# TestSniffer

手動テスト中に発生する API エラー（4xx/5xx）とコンソールエラーをリアルタイムで検知・通知するツールです。

---

## 機能

- **API エラー監視** — HTTP レスポンスのステータスコードが 400 以上のリクエストを自動検知
- **コンソールエラー監視** — ページ内の `console.error` を自動検知
- **監視パスフィルタ** — `WATCH_PATHS` で特定パスのエラーのみ通知・記録（未設定時は全 URL 対象）
- **OS デスクトップ通知** — エラー検知時にポップアップ通知（`node-notifier` が利用できない環境では自動でコンソール出力のみに切り替え）
- **ログ自動保存** — `logs/error_YYYYMMDD.log` にエラーを検知の都度即時追記
- **ブラウザ録画** — `[r]` キーで録画開始、`[s]` キーで停止・保存（`logs/videos/` に出力）

---

## 必要環境

- Node.js v18 以上

---

## セットアップ

```bash
# 1. 依存パッケージをインストール
npm install

# 2. Playwright の Chromium をインストール
npx playwright install chromium

# 3. .env ファイルを作成
cp .env.example .env
```

`.env` を開いて `START_URL` にテスト対象の URL を設定します。

```env
START_URL=https://your-app.example.com
```

---

## 起動方法

```bash
npm run start:watch
```

URL をコマンドライン引数で上書きする場合:

```bash
npm run start:watch -- --url https://staging.example.com
```

起動するとブラウザが立ち上がります。あとは通常通り手動テストを進めてください。エラーが発生すると自動的に通知・ログ記録されます。

---

## キーボードショートカット

ツール起動後、ターミナルで以下のキーを押すと録画を制御できます。

| キー | 動作 |
|------|------|
| `r` | 録画開始（同じ URL で録画用タブが開きます） |
| `s` | 録画停止・`logs/videos/` へ保存 |
| `Ctrl+C` | ツール終了 |

> **注意:** `[r]` を押した時点から録画が開始されます。録画中もエラー検知・通知は継続されます。

---

## 設定ファイル（.env）

| キー | 必須 | 説明 |
|------|------|------|
| `START_URL` | 任意 | ブラウザ起動時に開く URL（省略時: `https://example.com`） |
| `USER_DATA_DIR` | 任意 | Chromium のユーザーデータディレクトリのパス。指定するとログイン状態などのセッションを維持できる |
| `WATCH_PATHS` | 任意 | 監視対象パスをカンマ区切りで指定。指定したパスを含む URL のエラーのみ通知・記録する（省略時は全 URL 対象） |

```env
START_URL=https://example.com/dashboard

# ログイン状態を保持したい場合はコメントを外してパスを指定
# USER_DATA_DIR=/path/to/your/chrome-profile

# 特定パスのエラーのみ監視する場合はコメントを外して指定
# WATCH_PATHS=/api/v1,/dashboard
```

---

## ターミナル出力例

```
[10:00:00] [INFO] TestSniffer を起動しました。ブラウザを操作してください...
[10:00:00] [INFO] OS通知: 有効
[10:00:00] [INFO] ターゲットURL: https://example.com/dashboard
[10:00:00] [INFO] キーボードショートカット: [r] 録画開始（録画用タブが開きます）  [s] 録画停止・保存
[10:00:00] [INFO] 監視パス: すべて（WATCH_PATHS 未設定）

[10:01:23] [ERROR] 【API Error】 404
           URL   : https://example.com/api/v1/users/undefined
           Method: GET

[10:01:45] [ERROR] 【Console Error】
           Message: Uncaught TypeError: Cannot read properties of null (reading 'style')

[10:02:00] [REC] 録画を開始しました。録画用タブに切り替えました。停止するには [s] を押してください。
[10:03:00] [INFO] 録画を保存しました: logs/videos/rec_20260608_100300.webm
```

---

## ログファイル

エラーを検知するたびに `logs/error_YYYYMMDD.log` へ即時追記されます。`logs/` ディレクトリは自動生成されます。

```
[2026-06-08 10:01:23] [API ERROR]
URL       : https://example.com/api/v1/users/undefined
Method    : GET
Status    : 404
----------------------------------------
[2026-06-08 10:01:45] [CONSOLE ERROR]
URL       : https://example.com/dashboard
Message   : Uncaught TypeError: Cannot read properties of null (reading 'style')
----------------------------------------
```

---

## ディレクトリ構成

```
test-sniffer/
├── index.js          # メインエントリポイント
├── package.json
├── .env              # 各自が作成（.gitignore に含まれています）
├── .env.example      # 設定雛形
├── .gitignore
└── logs/
    ├── error_YYYYMMDD.log      # エラーログ（実行日ごとに自動生成）
    └── videos/
        └── rec_YYYYMMDD_HHmmss.webm  # 録画ファイル（[s] 保存時に生成）
```

---

## 終了方法

ブラウザウィンドウを閉じると、ツールも自動的に終了します。
