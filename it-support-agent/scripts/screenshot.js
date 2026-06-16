'use strict';

/*
 * 개발용: 실제 렌더러(index.html + preload)를 띄우고 질의를 입력한 뒤
 * 채팅 화면을 PNG로 캡처한다. 헤드리스 환경에서 UI 동작을 검증할 때 사용.
 *
 * 실행: xvfb-run -a node node_modules/electron/cli.js scripts/screenshot.js
 * 또는: xvfb-run -a npx electron scripts/screenshot.js
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const { KnowledgeBase } = require(path.join(ROOT, 'src/main/knowledgeBase'));
const searchEngine = require(path.join(ROOT, 'src/shared/searchEngine'));

const OUT_DIR = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.default.json'), 'utf8'));

let kb;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function registerIpc() {
  ipcMain.handle('search', (_e, q) => searchEngine.search(kb.getData(), q, { limit: 5, minScore: 4 }));
  ipcMain.handle('get-categories', () => searchEngine.listCategories(kb.getData()));
  ipcMain.handle('get-config', () => ({
    productName: config.productName,
    helpdesk: config.helpdesk || {},
    kbStatus: kb.getStatus(),
  }));
  ipcMain.handle('refresh-kb', () => ({ updated: false, status: kb.getStatus() }));
  ipcMain.handle('open-external', () => true);
  ipcMain.on('hide-window', () => {});
}

async function capture(win, name) {
  const img = await win.capturePage();
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, img.toPNG());
  console.log('captured', file);
}

app.whenReady().then(async () => {
  kb = new KnowledgeBase({
    bundledPath: path.join(ROOT, 'resources/knowledge-base.json'),
    cachePath: '/tmp/kb-shot.json',
    config,
    log: () => {},
  });
  kb.loadFromDisk();
  registerIpc();

  const win = new BrowserWindow({
    width: config.ui.windowWidth,
    height: config.ui.windowHeight,
    show: true,
    frame: false,
    webPreferences: {
      preload: path.join(ROOT, 'src/main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.join(ROOT, 'src/renderer/index.html'));
  await wait(700); // init() 렌더 대기
  await capture(win, '1-welcome.png');

  await win.webContents.executeJavaScript("runQuery('비밀번호를 잊어버렸어요 초기화 방법')");
  await wait(500);
  await capture(win, '2-password.png');

  await win.webContents.executeJavaScript("runQuery('재택근무 vpn 연결하고싶어')");
  await wait(500);
  await capture(win, '3-vpn.png');

  await win.webContents.executeJavaScript("runQuery('점심 메뉴 추천')");
  await wait(500);
  await capture(win, '4-noresult.png');

  await win.webContents.executeJavaScript("document.getElementById('messages').scrollTop=0; runQuery('프린터 출력 안돼요')");
  await wait(500);
  await capture(win, '5-printer.png');

  app.quit();
});
