// Hidden-window smoke test. Mocks only network/catalog/media; runs the actual built UI.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const item = { id: 'sakura:test-show', remote: true, title: '桌面集成测试', en: 'DESKTOP TEST', image: '', score: null, year: '2024', type: '日韩动漫', country: '日本', episodes: 2, episodeNumbers: [1,2], status: '2 集可选', subtitle: '测试', description: '桌面界面集成测试', color: '#777777' };
ipcMain.handle('window:state', () => ({maximized:false}));
ipcMain.handle('sources:load', () => ({}));
ipcMain.handle('catalog:browse', (_event, options) => ({ data: { items: options.cursor ? [{ ...item, id: 'sakura:test-next', title: '分页测试' }] : [item], page: options.cursor ? 2 : 1, nextCursor: options.cursor ? null : 'test-next-page' } }));
ipcMain.handle('catalog:detail', () => ({ data: item }));
ipcMain.handle('catalog:resolve', () => ({ data: ['https://first.example/1.mp4', 'https://second.example/1.mp4'] }));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'desktop-smoke' } });
  const errors = [];
  window.webContents.on('console-message', event => console.log('RENDERER', event.level, event.message, event.sourceId, event.lineNumber));
  window.webContents.on('preload-error', (_event, preloadPath, error) => console.error('PRELOAD_ERROR', error.message));
  window.webContents.on('render-process-gone', (_e, details) => errors.push(details.reason));
  try {
    window.webContents.debugger.attach('1.3');
    window.webContents.debugger.sendCommand('Runtime.enable').catch(() => {});
    window.webContents.debugger.on('message', (_event, method, params) => { if (method === 'Runtime.exceptionThrown') console.error('JS_EXCEPTION', JSON.stringify(params.exceptionDetails)); });
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const wait = async predicate => { for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 30)); } throw new Error('UI wait timeout: ' + document.body.innerText.slice(-1800)); };
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get() { return this.dataset.testSrc || ''; }, set(value) { this.dataset.testSrc = value; } });
      HTMLMediaElement.prototype.load = function() {};
      HTMLMediaElement.prototype.play = function() { this.dispatchEvent(new Event('playing')); return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function() {};
      await wait(() => document.querySelector('.card-title'));
      document.querySelector('.load-more button').click();
      await wait(() => document.querySelectorAll('.card-title').length === 2);
      document.querySelector('.card-title').focus();
      document.querySelector('.card-title').click();
      await wait(() => document.querySelector('.episode-grid button'));
      document.querySelector('.episode-grid button').click();
      await wait(() => document.querySelector('video')?.src.includes('first.example'));
      const media = document.querySelector('video');
      Object.defineProperty(media, 'currentTime', { configurable: true, writable: true, value: 123 });
      Object.defineProperty(media, 'duration', { configurable: true, value: 500 });
      media.dispatchEvent(new Event('timeupdate'));
      media.dispatchEvent(new Event('error'));
      await wait(() => media.src.includes('second.example'));
      media.currentTime = 0;
      // A synthetic metadata event must model HAVE_METADATA, not HAVE_NOTHING.
      Object.defineProperty(media, 'readyState', { configurable: true, value: 1 });
      media.dispatchEvent(new Event('loadedmetadata'));
      assert(media.currentTime === 123, 'did not preserve position');
      media.dispatchEvent(new Event('error'));
      await wait(() => document.querySelector('.playback-failure'));
      assert(!document.body.innerText.includes('first.example'), 'source exposed in viewer text');
      assert(!document.body.innerText.includes('second.example'), 'backup exposed in viewer text');
      assert(!document.querySelector('.toolbar-import'), 'source controls visible');
      const dialog = document.querySelector('[role="dialog"]');
      assert(dialog.contains(document.activeElement), 'modal focus escaped');
      document.querySelector('.modal-close').click();
      await wait(() => !document.querySelector('[role="dialog"]'));
      assert(document.activeElement.classList.contains('card-title'), 'modal focus was not restored');
      return 'native UI, pagination, modal focus, hidden candidates, bounded failover, and resume passed';
    })()`);
    if (errors.length) throw new Error(errors.join(', '));
    console.log('DESKTOP_SMOKE', result);
    app.exit(0);
  } catch (error) { console.error('DESKTOP_SMOKE_FAILED', error.message); app.exit(1); }
});
