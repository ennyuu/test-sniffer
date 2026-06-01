# TestSniffer

手動テスト中に発生する API エラー（4xx/5xx）とコンソールエラーをリアルタイムで検知・通知するツールです。

---

## 機能

- **API エラー監視** — HTTP レスポンスのステータスコードが 400 以上のリクエストを自動検知
- **コンソールエラー監視** — ページ内の `console.error` を自動検知
- **OS デスクトップ通知** — エラー検知時にポップアップ通知（`node-notifier` が利用できない環境では自動でコンソール出力のみに切り替え）
- **ログ自動保存** — `logs/error_YYYYMMDD.log` にエラーを検知の都度即時追記

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

## 設定ファイル（.env）

| キー | 必須 | 説明 |
|------|------|------|
| `START_URL` | 任意 | ブラウザ起動時に開く URL（省略時: `https://example.com`） |
| `USER_DATA_DIR` | 任意 | Chromium のユーザーデータディレクトリのパス。指定するとログイン状態などのセッションを維持できる |

```env
START_URL=https://example.com/dashboard

# ログイン状態を保持したい場合はコメントを外してパスを指定
# USER_DATA_DIR=/path/to/your/chrome-profile
```

---

## ターミナル出力例

```
[10:00:00] [INFO] TestSniffer を起動しました。ブラウザを操作してください...
[10:00:00] [INFO] OS通知: 有効
[10:00:05] [INFO] ターゲットURL: https://example.com/dashboard

[10:01:23] [ERROR] 【API Error】 404
           URL   : https://example.com/api/v1/users/undefined
           Method: GET

[10:01:45] [ERROR] 【Console Error】
           Message: Uncaught TypeError: Cannot read properties of null (reading 'style')
```

---

## ログファイル

エラーを検知するたびに `logs/error_YYYYMMDD.log` へ即時追記されます。`logs/` ディレクトリは自動生成されます。

```
[2026-06-01 10:01:23] [API ERROR]
URL       : https://example.com/api/v1/users/undefined
Method    : GET
Status    : 404
----------------------------------------
[2026-06-01 10:01:45] [CONSOLE ERROR]
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
    └── error_YYYYMMDD.log   # 実行日ごとに自動生成
```

---

## 終了方法

ブラウザウィンドウを閉じると、ツールも自動的に終了します。
