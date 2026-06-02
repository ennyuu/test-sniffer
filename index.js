'use strict';

// 環境変数の読み込み（.env ファイルが存在する場合）
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const pc = require('picocolors');

// ------------------------------------------------------------
// OS通知ライブラリの読み込み（失敗時はフォールバックモード）
// ------------------------------------------------------------
let notifier = null;
let notifyEnabled = false;
try {
  notifier = require('node-notifier');
  notifyEnabled = true;
} catch (_) {
  // node-notifier が利用できない場合はフォールバックモード
}

// ------------------------------------------------------------
// コマンドライン引数のパース（--url <value>）
// ------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf('--url');
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    return args[urlIndex + 1];
  }
  return null;
}

// ------------------------------------------------------------
// 起動 URL の決定（優先順: CLI引数 > .env > デフォルト）
// ------------------------------------------------------------
const cliUrl = parseArgs();
const startUrl = cliUrl || process.env.START_URL || 'https://example.com';

// Chromium ユーザーデータディレクトリ（未指定なら一時プロファイル）
const userDataDir = process.env.USER_DATA_DIR || null;

// ------------------------------------------------------------
// ログファイルのパス生成（logs/error_YYYYMMDD.log）
// ------------------------------------------------------------
function getLogFilePath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return path.join(__dirname, 'logs', `error_${yyyy}${mm}${dd}.log`);
}

// logs/ ディレクトリが存在しない場合は自動生成
function ensureLogsDir() {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// ------------------------------------------------------------
// タイムスタンプ文字列の生成
// ------------------------------------------------------------
function getTimestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function getFullTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss}`;
}

// ------------------------------------------------------------
// ログファイルへの即時追記
// ------------------------------------------------------------
function appendLog(block) {
  ensureLogsDir();
  const logPath = getLogFilePath();
  fs.appendFileSync(logPath, block + '\n', 'utf8');
}

// ------------------------------------------------------------
// OS通知の送信
// ------------------------------------------------------------
function sendNotification(title, message) {
  if (!notifyEnabled || !notifier) return;
  try {
    notifier.notify({ title, message });
  } catch (_) {
    // 通知失敗は無視（コンソール・ログで代替済み）
  }
}

// ------------------------------------------------------------
// APIエラー（4xx/5xx）の処理
// ------------------------------------------------------------
function handleApiError(url, method, status) {
  const ts = getTimestamp();
  const fullTs = getFullTimestamp();

  // ターミナル出力（赤色）
  console.log(
    pc.red(`[${ts}] [ERROR] 【API Error】 ${status}`) +
    `\n           URL   : ${url}` +
    `\n           Method: ${method}`
  );

  // ログファイルへ即時追記
  const logBlock =
    `[${fullTs}] [API ERROR]\n` +
    `URL       : ${url}\n` +
    `Method    : ${method}\n` +
    `Status    : ${status}\n` +
    `----------------------------------------`;
  appendLog(logBlock);

  // OS通知
  sendNotification(
    `TestSniffer: API Error ${status}`,
    `${method} ${url}`
  );
}

// ------------------------------------------------------------
// コンソールエラーの処理
// ------------------------------------------------------------
function handleConsoleError(pageUrl, message) {
  const ts = getTimestamp();
  const fullTs = getFullTimestamp();

  // ターミナル出力（赤色）
  console.log(
    pc.red(`[${ts}] [ERROR] 【Console Error】`) +
    `\n           Message: ${message}`
  );

  // ログファイルへ即時追記
  const logBlock =
    `[${fullTs}] [CONSOLE ERROR]\n` +
    `URL       : ${pageUrl}\n` +
    `Message   : ${message}\n` +
    `----------------------------------------`;
  appendLog(logBlock);

  // OS通知
  sendNotification(
    'TestSniffer: Console Error',
    message.slice(0, 100)
  );
}

// ------------------------------------------------------------
// メイン処理
// ------------------------------------------------------------
async function main() {
  const ts = getTimestamp();

  // 起動メッセージ
  console.log(pc.green(`[${ts}] [INFO] TestSniffer を起動しました。ブラウザを操作してください...`));

  // OS通知の状態を表示
  if (notifyEnabled) {
    console.log(pc.green(`[${ts}] [INFO] OS通知: 有効`));
  } else {
    console.log(
      pc.yellow(`[${ts}] [WARN] OS 通知は無効です（node-notifier を利用できませんでした）。\n` +
      `                  エラーはターミナルとログファイルで確認してください。`)
    );
  }

  console.log(pc.green(`[${ts}] [INFO] ターゲットURL: ${startUrl}`));

  // ブラウザ起動オプションの構築
  const launchOptions = {
    headless: false,
  };

  let browser;
  let context;

  if (userDataDir) {
    // ユーザーデータディレクトリが指定されている場合（セッション維持）
    context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
    });
    browser = null;
  } else {
    // 通常の一時プロファイルで起動
    browser = await chromium.launch(launchOptions);
    context = await browser.newContext();
  }

  const page = await context.newPage();

  // ------------------------------------------------------------
  // コンソールエラーの監視
  // ------------------------------------------------------------
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const pageUrl = page.url();
      handleConsoleError(pageUrl, msg.text());
    }
  });

  // ------------------------------------------------------------
  // ネットワークエラー（4xx/5xx）の監視
  // ------------------------------------------------------------
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      const url = response.url();
      const method = response.request().method();
      handleApiError(url, method, status);
    }
  });

  // 指定 URL を開く
  await page.goto(startUrl);

  // ページ（ブラウザウィンドウ）が閉じられたらクリーンアップして終了
  // context.close イベントはユーザーによるウィンドウ閉じでは発火しないため、
  // page の close イベントを使用する
  page.on('close', async () => {
    console.log(pc.green(`[${getTimestamp()}] [INFO] ブラウザが閉じられました。TestSniffer を終了します。`));
    try { await context.close(); } catch (_) {}
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(pc.red(`[ERROR] 予期しないエラーが発生しました: ${err.message}`));
  process.exit(1);
});
