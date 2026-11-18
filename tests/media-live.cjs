// Real network + real Chromium/HLS decode test. No anime source is impersonated.
const { app, BrowserWindow, ipcMain, net } = require('electron');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
let item = { id: 'sakura:media-test', remote: true, title: '真实视频解码测试', en: 'PUBLIC TEST MEDIA', image: '', score: null, year: '', type: '测试素材', country: '', episodes: 1, episodeNumbers: [1], status: '公开测试流', description: '此内容仅用于播放器网络与解码测试，不是番剧正片。', color: '#777777' };
const providerLive = process.argv.includes('--provider-live');
const failPrimary = process.argv.includes('--fail-primary');
const soak=process.argv.includes('--soak');
const providerTitle = process.env.TOM_SAKURA_TEST_TITLE || '武神主宰';
let liveCandidates;
let failedRequests = 0;
let copiedDiagnostic;
ipcMain.handle('playback:copy-diagnostic',(_event,payload)=>{copiedDiagnostic=require('../electron/diagnostics.cjs').buildPlaybackDiagnostic(payload,require('../package.json').version);return{ok:true};});
const server = http.createServer((_request, response) => { failedRequests++; response.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); response.end(); });
const stream = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
ipcMain.handle('window:state', () => ({maximized:false}));
ipcMain.handle('sources:load', () => ({}));
ipcMain.handle('catalog:browse', () => ({ data: { items: [item], page: 1, nextCursor: null } }));
ipcMain.handle('catalog:detail', () => ({ data: item }));
ipcMain.handle('catalog:resolve', () => ({ data: [`http://127.0.0.1:${server.address().port}/missing.mp4`, ...(liveCandidates || [stream])] }));
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  if (providerLive) {
    try {
      const { createContentService } = require('../electron/content-service.cjs');
      const content = createContentService((...args) => net.fetch(...args));
      const matches = await content.list(providerTitle);
      const match = matches.find(entry => entry.title === providerTitle && entry.id.startsWith('one:'));
      if (!match) throw new Error('No exact-title primary-site match');
      item = await content.detail(match.id);
      liveCandidates = await content.resolve(item.id,item.episodeNumbers[0]);
      if (!liveCandidates.length) throw new Error('No public playback candidates');
    } catch (error) { console.error('PROVIDER_TEST_FAILED',error.message); server.close(); app.exit(1); return; }
  }
  const window = new BrowserWindow({ show: false, width: 1440, height: 940, webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'real-media-test', backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  let blockedPrimaryRequests = 0;
  if (providerLive && failPrimary) {
    const origin = new URL(liveCandidates[0]).origin;
    window.webContents.session.webRequest.onBeforeRequest({urls:[origin+'/*']}, (_details, callback) => { blockedPrimaryRequests++; callback({cancel:true}); });
  }
  try {
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const wait = async (predicate, timeout = 70000) => { const start = Date.now(); let failedSince=0; while (Date.now() - start < timeout) { if (predicate()) return; if(document.querySelector('.playback-failure')){failedSince ||= Date.now();if(Date.now()-failedSince>1500)break;}else failedSince=0;await new Promise(r => setTimeout(r, 100)); } throw new Error('Real media timeout: ' + document.querySelector('.player-area')?.innerText); };
      await wait(() => document.querySelector('.card-title'), 5000);
      document.querySelector('.card-title').click();
      await wait(() => document.querySelector('.episode-grid button'), 5000);
      document.querySelector('.episode-grid button').click();
      await wait(() => { const v = document.querySelector('video'); return v && v.currentTime >= 3 && v.videoWidth > 0 && v.getVideoPlaybackQuality().totalVideoFrames > 0; });
      const v = document.querySelector('video');
      if(!v.src.startsWith('blob:'))throw new Error('Desktop HLS incorrectly selected the opaque native path');
      const result = { engine: 'managed-hls', seconds: v.currentTime, width: v.videoWidth, height: v.videoHeight, decodedFrames: v.getVideoPlaybackQuality().totalVideoFrames };
      const target = Math.min(30, v.duration/2);
      v.currentTime = target;
      await wait(() => !v.paused && v.currentTime > target + 1 && v.readyState >= 3);
      result.seekedTo = v.currentTime;
      result.seconds = v.currentTime;
      const rateSelect = document.querySelector('[aria-label="播放速度"]');
      rateSelect.value = '1.5'; rateSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(() => v.playbackRate === 1.5, 2000);
      document.querySelector('.modal-close').click();
      await wait(() => !document.querySelector('video'), 2000);
      document.querySelector('.card-title').click();
      await wait(() => document.querySelector('.episode-grid button'), 5000);
      document.querySelector('.episode-grid button').click();
      await wait(() => { const v = document.querySelector('video'); return v && !v.paused && v.currentTime > result.seconds + 1 && v.readyState >= 3 && v.getVideoPlaybackQuality().totalVideoFrames > 0; });
      result.resumedAt = document.querySelector('video').currentTime;
      result.rate = document.querySelector('video').playbackRate;
      if(${soak}) {
        const startTime=document.querySelector('video').currentTime,started=performance.now();
        while(performance.now()-started<45000) {
          if(document.querySelector('.playback-failure'))throw new Error('Sustained playback failed');
          await new Promise(resolve=>setTimeout(resolve,500));
        }
        const media=document.querySelector('video');
        result.soakSeconds=Math.round((performance.now()-started)/1000);
        result.mediaAdvanced=media.currentTime-startTime;
        result.totalDecodedFrames=media.getVideoPlaybackQuality().totalVideoFrames;
        if(result.mediaAdvanced<45*result.rate*0.8)throw new Error('Sustained playback made insufficient progress');
      }
      return result;
    })()`, true);
    if (providerLive && failPrimary && blockedPrimaryRequests === 0) throw new Error('Primary outage was not exercised');
    if (failedRequests !== 1) throw new Error(`Expected one failed-source request then healthy-source preference; got ${failedRequests}`);
    await fs.mkdir(path.join(__dirname, '../.research/screenshots'), { recursive: true });
    await fs.writeFile(path.join(__dirname, providerLive ? '../.research/screenshots/provider-player.png' : '../.research/screenshots/real-player.png'), (await window.webContents.capturePage()).toPNG());
    console.log(providerLive ? 'PROVIDER_MEDIA_PASSED' : 'REAL_MEDIA_PASSED', JSON.stringify({ title:item.title, ...result, failedRequests, blockedPrimaryRequests }));
    server.close(); app.exit(0);
  } catch (error) {
    try { await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.innerText.includes('复制诊断'))?.click()`); await new Promise(r=>setTimeout(r,100)); } catch {}
    console.error('REAL_MEDIA_FAILED', error.message,JSON.stringify(copiedDiagnostic));server.close();app.exit(1);
  }
});
