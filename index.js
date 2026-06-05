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

// 監視対象パスフィルタ（カンマ区切り、未指定時は全 URL を対象にする）
const watchPaths = process.env.WATCH_PATHS
  ? process.env.WATCH_PATHS.split(',').map((p) => p.trim()).filter(Boolean)
  : [];

// 録画状態フラグ（r キーで true、s キーで false）
let isRecording = false;

// 動画の一時保存ディレクトリ（recordVideo はコンテキスト作成時に指定が必要なため常時有効）
const tempVideoDir = path.join(__dirname, 'logs', 'videos', '.tmp');

// ------------------------------------------------------------
// URL が監視対象パスに一致するか判定
// watchPaths が空（WATCH_PATHS 未設定）の場合は全 URL を対象にする
// ------------------------------------------------------------
function isWatched(url) {
  if (watchPaths.length === 0) return true;
  return watchPaths.some((p) => url.includes(p));
}

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

// logs/videos/ ディレクトリ（および一時ディレクトリ）を自動生成
function ensureVideosDir() {
  fs.mkdirSync(path.join(__dirname, 'logs', 'videos'), { recursive: true });
  fs.mkdirSync(tempVideoDir, { recursive: true });
}

// 動画ファイルの保存パスを生成（logs/videos/rec_YYYYMMDD_HHmmss.webm）
function getVideoSavePath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return path.join(__dirname, 'logs', 'videos', `rec_${yyyy}${mo}${dd}_${hh}${mm}${ss}.webm`);
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
  console.log(pc.green(`[${ts}] [INFO] キーボードショートカット: [r] 録画開始  [s] 録画停止・保存`));

  // WATCH_PATHS の状態を表示
  if (watchPaths.length > 0) {
    console.log(pc.green(`[${ts}] [INFO] 監視パス: ${watchPaths.join(', ')}`));
  } else {
    console.log(pc.green(`[${ts}] [INFO] 監視パス: すべて（WATCH_PATHS 未設定）`));
  }

  // ブラウザ起動オプションの構築
  const launchOptions = {
    headless: false,
  };

  // viewport: null を指定することで固定ビューポートを解除し、
  // ウィンドウのリサイズに合わせて表示領域が伸縮するようにする。
  // recordVideo はコンテキスト作成時にしか指定できないため、
  // 常時録画しておき r/s キーで保存タイミングを制御する。
  ensureVideosDir();
  const contextOptions = {
    viewport: null,
    recordVideo: { dir: tempVideoDir },
  };

  let browser;
  let context;

  if (userDataDir) {
    // ユーザーデータディレクトリが指定されている場合（セッション維持）
    context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      ...contextOptions,
    });
    browser = null;
  } else {
    // 通常の一時プロファイルで起動
    browser = await chromium.launch(launchOptions);
    context = await browser.newContext(contextOptions);
  }

  const page = await context.newPage();

  // ------------------------------------------------------------
  // コンソールエラーの監視
  // ------------------------------------------------------------
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const pageUrl = page.url();
      // WATCH_PATHS が設定されている場合、対象パスを含む URL のみ処理する
      if (isWatched(pageUrl)) {
        handleConsoleError(pageUrl, msg.text());
      }
    }
  });

  // ------------------------------------------------------------
  // ネットワークエラー（4xx/5xx）の監視
  // ------------------------------------------------------------
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      const url = response.url();
      // WATCH_PATHS が設定されている場合、対象パスを含む URL のみ処理する
      if (isWatched(url)) {
        const method = response.request().method();
        handleApiError(url, method, status);
      }
    }
  });

  // 指定 URL を開く（タイムアウトを 60 秒に設定）
  await page.goto(startUrl, { timeout: 60000 });

  // ------------------------------------------------------------
  // ターミナルキー入力による録画制御
  // r キー: 録画開始（[REC] 表示）
  // s キー: 録画停止・logs/videos/ へ保存
  // ------------------------------------------------------------
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key) => {
      if (key === 'r' || key === 'R') {
        // 録画開始（すでに録画中の場合は無視）
        if (!isRecording) {
          isRecording = true;
          console.log(pc.red(`[${getTimestamp()}] [REC] 録画を開始しました。停止するには [s] を押してください。`));
        }
      } else if (key === 's' || key === 'S') {
        // 録画停止・保存（非録画状態での押下はエラーにしない）
        if (isRecording) {
          isRecording = false;
          const savePath = getVideoSavePath();
          try {
            await page.video().saveAs(savePath);
            console.log(pc.green(`[${getTimestamp()}] [INFO] 録画を保存しました: logs/videos/${path.basename(savePath)}`));
          } catch (e) {
            console.log(pc.yellow(`[${getTimestamp()}] [WARN] 録画の保存に失敗しました: ${e.message}`));
          }
        }
      } else if (key === '\u0003') {
        // Ctrl+C による手動終了
        process.exit(0);
      }
    });
  }

  // ページ（ブラウザウィンドウ）が閉じられたらクリーンアップして終了
  // context.close イベントはユーザーによるウィンドウ閉じでは発火しないため、
  // page の close イベントを使用する
  page.on('close', async () => {
    console.log(pc.green(`[${getTimestamp()}] [INFO] ブラウザが閉じられました。TestSniffer を終了します。`));
    // stdin の raw モードを解除してから終了する
    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch (_) {}
    }
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
