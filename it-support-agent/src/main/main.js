'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const { KnowledgeBase } = require('./knowledgeBase');
const searchEngine = require('../shared/searchEngine');

const isDev = process.argv.includes('--dev');
const ROOT = path.join(__dirname, '..', '..');

let tray = null;
let win = null;
let kb = null;
let config = null;

// ── 로깅 ────────────────────────────────────────────────
function log(msg) {
  if (isDev) console.log(`[it-support-agent] ${msg}`);
}

// ── 설정 로드 (config.default.json + 사용자 override) ────
function loadConfig() {
  const defaults = readJson(path.join(ROOT, 'config.default.json')) || {};
  // 사내 배포 시 운영자가 userData/config.local.json 으로 서버 주소 등 덮어쓸 수 있음
  const override = readJson(path.join(app.getPath('userData'), 'config.local.json')) || {};
  return deepMerge(defaults, override);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] || {}, v) : v;
  }
  return out;
}

// 패키징 여부에 따라 resources 경로가 달라짐
function resourcePath(rel) {
  const packed = path.join(process.resourcesPath || '', 'resources', rel);
  if (process.resourcesPath && fs.existsSync(packed)) return packed;
  return path.join(ROOT, 'resources', rel);
}

// ── 트레이 아이콘 ────────────────────────────────────────
function createTray() {
  let image = nativeImage.createFromPath(resourcePath('tray-icon.png'));
  if (image.isEmpty()) {
    // 아이콘 파일이 없을 때를 대비한 폴백(빈 이미지면 일부 OS에서 안 보일 수 있음)
    log('WARN: tray icon empty');
  }
  tray = new Tray(image);
  tray.setToolTip(config.productName || 'IT 도우미');
  refreshTrayMenu();

  // 좌클릭: 창 토글 (Windows/Linux)
  tray.on('click', () => toggleWindow());
}

function refreshTrayMenu() {
  const status = kb ? kb.getStatus() : {};
  const menu = Menu.buildFromTemplate([
    { label: `${config.productName || 'IT 도우미'} 열기`, click: () => showWindow() },
    { type: 'separator' },
    {
      label: '매뉴얼 새로고침',
      click: async () => {
        await kb.syncFromServer();
        refreshTrayMenu();
        if (win) win.webContents.send('kb-updated', kb.getStatus());
      },
    },
    { label: `매뉴얼 버전: ${status.version || '-'}`, enabled: false },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ── 채팅 창 ──────────────────────────────────────────────
function createWindow() {
  const ui = config.ui || {};
  win = new BrowserWindow({
    width: ui.windowWidth || 420,
    height: ui.windowHeight || 560,
    show: false,
    frame: false,
    resizable: isDev,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  win.on('close', (e) => {
    // X 버튼은 종료가 아니라 숨김
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  if (config.ui && config.ui.hideOnBlur) {
    win.on('blur', () => {
      if (!isDev) win.hide();
    });
  }
}

/** 트레이 아이콘 근처에 창을 배치 */
function positionWindow() {
  if (!win || !tray) return;
  try {
    const trayBounds = tray.getBounds();
    const winBounds = win.getBounds();
    const display = screen.getDisplayMatching(trayBounds);
    const workArea = display.workArea;

    let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
    let y = Math.round(trayBounds.y - winBounds.height - 8);

    // 트레이가 화면 상단이면 아래로 펼침
    if (y < workArea.y) y = Math.round(trayBounds.y + trayBounds.height + 8);
    // 화면 밖으로 나가지 않도록 보정
    x = Math.min(Math.max(x, workArea.x + 4), workArea.x + workArea.width - winBounds.width - 4);

    win.setPosition(x, y, false);
  } catch (err) {
    log(`positionWindow error: ${err.message}`);
  }
}

function showWindow() {
  if (!win) createWindow();
  positionWindow();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (!win) return showWindow();
  if (win.isVisible()) win.hide();
  else showWindow();
}

// ── IPC 핸들러 ───────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('search', (_e, query) => {
    return searchEngine.search(kb.getData(), query, { limit: 5, minScore: 4 });
  });

  ipcMain.handle('get-categories', () => {
    return searchEngine.listCategories(kb.getData());
  });

  ipcMain.handle('get-config', () => {
    return {
      productName: config.productName,
      helpdesk: config.helpdesk || {},
      kbStatus: kb.getStatus(),
    };
  });

  ipcMain.handle('refresh-kb', async () => {
    const result = await kb.syncFromServer();
    refreshTrayMenu();
    return { ...result, status: kb.getStatus() };
  });

  ipcMain.handle('open-external', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.on('hide-window', () => {
    if (win) win.hide();
  });
}

// ── 앱 라이프사이클 ──────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(async () => {
    config = loadConfig();

    kb = new KnowledgeBase({
      bundledPath: resourcePath('knowledge-base.json'),
      cachePath: path.join(app.getPath('userData'), 'knowledge-base.cache.json'),
      config,
      log,
    });
    kb.loadFromDisk();

    registerIpc();
    createWindow();
    createTray();

    // 시작 시 서버 동기화(비동기, 실패해도 무방)
    if (config.knowledgeBase && config.knowledgeBase.syncOnStartup) {
      kb.syncFromServer().then(() => {
        refreshTrayMenu();
        if (win) win.webContents.send('kb-updated', kb.getStatus());
      });
    }

    // Windows 트레이 앱은 보통 시작 시 창을 띄우지 않고 트레이에 상주
    if (isDev) showWindow();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  // 트레이 상주 앱이므로 모든 창이 닫혀도 종료하지 않음
  app.on('window-all-closed', (e) => {
    e.preventDefault();
  });
}
