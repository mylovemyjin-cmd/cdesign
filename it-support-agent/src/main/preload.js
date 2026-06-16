'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 렌더러(채팅 UI)에 노출되는 안전한 API.
 * contextIsolation=true 환경에서 window.api 로 접근한다.
 * 검색/매뉴얼 데이터는 모두 메인 프로세스에 머무르며, 렌더러는 질의/결과만 주고받는다.
 */
contextBridge.exposeInMainWorld('api', {
  search: (query) => ipcRenderer.invoke('search', query),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  refreshKB: () => ipcRenderer.invoke('refresh-kb'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  hideWindow: () => ipcRenderer.send('hide-window'),
  onKbUpdated: (cb) => ipcRenderer.on('kb-updated', (_e, status) => cb(status)),
});
