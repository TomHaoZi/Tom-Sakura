const { app, BrowserWindow, ipcMain, dialog, net, screen, session, powerSaveBlocker, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const { validateSources, MAX_SIZE } = require('./sources.cjs');
const { createContentService } = require('./content-service.cjs');
const { normalizeWindowState } = require('./window-state.cjs');
const { buildPlaybackDiagnostic } = require('./diagnostics.cjs');

const catalog = createContentService((...args) => net.fetch(...args));
const dev = !app.isPackaged && process.argv.includes('--dev');
let window, sleepBlocker;
let importing = false;
const trusted = event => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
const userFile = name => path.join(app.getPath('userData'), name);
function setPlaybackActive(active) {
  if (active && sleepBlocker === undefined) sleepBlocker = powerSaveBlocker.start('prevent-display-sleep');
  if (!active && sleepBlocker !== undefined) { powerSaveBlocker.stop(sleepBlocker); sleepBlocker = undefined; }
}
async function createWindow() {
  let saved = {};
  try { const text = await fs.readFile(userFile('window.json'), 'utf8'); if (text.length < 16384) saved = JSON.parse(text); } catch {}
  const primary = screen.getPrimaryDisplay();
  const displays = [primary, ...screen.getAllDisplays().filter(d => d.id !== primary.id)];
  const { maximized, ...bounds } = normalizeWindowState(saved, displays.map(d => d.workArea));
  window = new BrowserWindow({
    ...bounds, show: false, frame: false, backgroundColor: '#e7eaf3', title: 'Tom Sakura',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, devTools: dev },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { event.preventDefault(); window.setFullScreen(!window.isFullScreen()); }
    if (input.key === 'Escape' && window.isFullScreen()) { event.preventDefault(); window.setFullScreen(false); }
  });
  window.webContents.on('render-process-gone', async () => {
    setPlaybackActive(false);
    if (window.isDestroyed()) return;
    const result = await dialog.showMessageBox(window, { type: 'error', title: 'Tom Sakura', message: '界面意外退出，本机追番与观看记录仍保留。', buttons: ['重新加载', '退出'], defaultId: 0, cancelId: 1 });
    if (window.isDestroyed()) return;
    if (result.response === 0) window.reload(); else app.quit();
  });
  window.on('maximize', () => window.webContents.send('window:maximized', true));
  window.on('unmaximize', () => window.webContents.send('window:maximized', false));
  window.on('close', () => {
    setPlaybackActive(false);
    try {
      const state = { ...window.getNormalBounds(), maximized: window.isMaximized() };
      syncFs.writeFileSync(userFile('window.json.tmp'), JSON.stringify(state), 'utf8');
      syncFs.renameSync(userFile('window.json.tmp'), userFile('window.json'));
    } catch {}
  });
  window.once('ready-to-show', () => { if (maximized) window.maximize(); window.show(); });
  try {
    if (dev) await window.loadURL('http://127.0.0.1:5173');
    else await window.loadFile(path.join(__dirname, '../dist/index.html'));
  } catch { dialog.showErrorBox('Tom Sakura', '无法加载应用界面，请重新安装或重新构建应用。'); app.quit(); }
}
ipcMain.on('window:action', (event, action) => {
  if (!trusted(event)) return;
  if (action === 'minimize') window.minimize();
  if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
  if (action === 'close') window.close();
});
ipcMain.handle('playback:copy-diagnostic', (event, payload) => {
  if (!trusted(event)) return {ok:false};
  try { clipboard.writeText(JSON.stringify(buildPlaybackDiagnostic(payload,app.getVersion()),null,2)); return {ok:true}; }
  catch { return {ok:false}; }
});
ipcMain.handle('window:state', event => trusted(event) ? { maximized: window.isMaximized() } : null);
ipcMain.on('playback:activity', (event, active) => { if (trusted(event) && typeof active === 'boolean') setPlaybackActive(active); });
ipcMain.handle('sources:import', async event => {
  if (!trusted(event) || importing) return { error: '请关闭其他导入窗口后重试' };
  importing = true;
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: '维护模式：导入授权片源', filters: [{ name: '片源 JSON', extensions: ['json'] }], properties: ['openFile'] });
    if (canceled) return null;
    if ((await fs.stat(filePaths[0])).size > MAX_SIZE) throw new Error('文件不能超过 2 MB');
    const sources = validateSources(JSON.parse(await fs.readFile(filePaths[0], 'utf8')));
    await fs.writeFile(userFile('sources.json.tmp'), JSON.stringify(sources), 'utf8');
    await fs.rename(userFile('sources.json.tmp'), userFile('sources.json'));
    return { sources };
  } catch (error) {
    return { error: error instanceof SyntaxError ? '文件不是有效的 JSON' : error.code ? '无法读取或保存配置文件' : error.message };
  } finally { importing = false; }
});
ipcMain.handle('sources:load', async event => {
  if (!trusted(event)) return {};
  try {
    if ((await fs.stat(userFile('sources.json'))).size > MAX_SIZE) return {};
    return validateSources(JSON.parse(await fs.readFile(userFile('sources.json'), 'utf8')));
  } catch { return {}; }
});
for (const method of ['list', 'browse', 'detail', 'resolve']) {
  ipcMain.handle(`catalog:${method}`, async (event, ...args) => {
    if (!trusted(event)) return { error: '无效的窗口' };
    try { return { data: await catalog[method](...args) }; }
    catch { return { error: '内容暂不可用，请稍后重试' }; }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.tomsakura.desktop');
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen'));
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen');
    session.defaultSession.on('will-download', event => event.preventDefault());
    await createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(() => { dialog.showErrorBox('Tom Sakura', '应用启动失败，请检查安装文件。'); app.quit(); });
}
app.on('before-quit', () => setPlaybackActive(false));
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
