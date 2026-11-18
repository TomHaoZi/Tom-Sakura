// Runs the real main process + preload + renderer + live catalog in an isolated profile.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const profile = path.join(__dirname, '../.research/app-live-profile');
fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
BrowserWindow.prototype.show = function() {}; // Do not interrupt the user's desktop.
if (process.argv.includes('--packaged')) {
  const Module=require('node:module');
  const original=Module._resolveFilename;
  const outside=path.join(__dirname,'../node_modules')+path.sep;
  Module._resolveFilename=function(request,parent,...args) {
    const result=original.call(this,request,parent,...args);
    if(parent?.filename?.includes('app.asar')&&typeof result==='string'&&result.startsWith(outside)) throw new Error('Packaged runtime leaked a project dependency: '+request);
    return result;
  };
  require(path.join(__dirname,'../release',require('../package.json').version,'win-unpacked/resources/app.asar/electron/main.cjs'));
} else require('../electron/main.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
app.whenReady().then(async () => {
  let window;
  try {
    for(let i=0;i<200;i++) { window=BrowserWindow.getAllWindows()[0]; if(window?.webContents.getURL().startsWith('file:')&&!window.webContents.isLoadingMainFrame()) break; await sleep(50); }
    if(!window) throw new Error('No desktop window');
    if(window.webContents.getBackgroundThrottling()!==false)throw new Error('Media watchdog timers are allowed to be throttled in background');
    if(process.argv.includes('--visual')) {
      const folder=path.join(__dirname,'../.research/screenshots');fs.mkdirSync(folder,{recursive:true});
      const ui=code=>window.webContents.executeJavaScript(`(async()=>{const wait=async(fn)=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Visual UI timeout');};${code}})()`,true);
      const capture=async name=>{await sleep(1000);fs.writeFileSync(path.join(folder,name+'.png'),(await window.webContents.capturePage()).toPNG());};
      window.setContentSize(1440,940);
      await ui(`await wait(()=>document.querySelector('.card-title'));document.querySelector('.settings-nav').click();await wait(()=>document.querySelector('.appearance-segments'));document.querySelector('.appearance-segments button:first-child').click();await wait(()=>document.documentElement.dataset.theme==='light');document.querySelector('.modal-close').click();await wait(()=>!document.querySelector('[role="dialog"]'));`);
      await capture('glass-home-light');
      await ui(`document.querySelector('.settings-nav').click();await wait(()=>document.querySelector('.settings-modal'));`);
      await capture('glass-settings-light');
      await ui(`document.querySelector('.appearance-segments button:nth-child(2)').click();await wait(()=>document.documentElement.dataset.theme==='dark');`);
      await capture('glass-settings-dark');
      await ui(`document.querySelector('.modal-close').click();await wait(()=>!document.querySelector('[role="dialog"]'));`);
      await capture('glass-home-dark');
      window.setContentSize(1000,680);
      await capture('glass-home-compact');
      window.setContentSize(1440,940);
      await ui(`document.querySelector('.settings-nav').click();await wait(()=>document.querySelector('.appearance-segments'));document.querySelector('.appearance-segments button:first-child').click();await wait(()=>document.documentElement.dataset.theme==='light');document.querySelector('.modal-close').click();await wait(()=>!document.querySelector('[role="dialog"]'));`);
    }
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const wait=async(fn)=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Live UI timeout: '+document.body.innerText.slice(-400));};
      await wait(()=>document.querySelectorAll('.card-title').length>0);
      const homeCount=document.querySelectorAll('.card-title').length;
      if (${process.argv.includes('--quality')}) {
        document.querySelector('.settings-nav').click();
        await wait(()=>document.querySelector('[aria-label="默认播放策略"]'));
        const strategy=document.querySelector('[aria-label="默认播放策略"]');
        strategy.value='quality';strategy.dispatchEvent(new Event('change',{bubbles:true}));
        await wait(()=>JSON.parse(localStorage.getItem('ts-preferences')).strategy==='quality');
        document.querySelector('.modal-close').click();
      }
      const input=document.querySelector('[aria-label="搜索番剧"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'葬送的芙莉莲');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>!document.querySelector('.catalog-loading')&&document.querySelectorAll('.card-title').length<=8&&[...document.querySelectorAll('.card-title')].some(node=>node.innerText==='葬送的芙莉莲'));
      let playback=null;
      if (${process.argv.includes('--play')}) {
        [...document.querySelectorAll('.card-title')].find(node=>node.innerText==='葬送的芙莉莲').click();
        await wait(()=>document.querySelector('.episode-grid button'));
        document.querySelector('.episode-grid button').click();
        const started=Date.now();
        while(Date.now()-started<90000) { const v=document.querySelector('video'); if(v&&!v.paused&&v.currentTime>=3&&v.videoWidth>0&&v.getVideoPlaybackQuality().totalVideoFrames>0) {playback={seconds:v.currentTime,width:v.videoWidth,height:v.videoHeight,decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames};break;} await new Promise(r=>setTimeout(r,100)); }
        if(!playback)throw new Error('Packaged real-player check failed');
        if (${process.argv.includes('--quality')} && document.querySelector('[aria-label="播放策略"]')?.value!=='quality')throw new Error('Player did not use selected quality policy');
        await wait(()=>{const v=document.querySelector('video');return v?.videoWidth>0&&document.querySelector('.decoded-resolution')?.textContent===v.videoWidth+'×'+v.videoHeight;});
        document.querySelector('.modal-close').click();
      }
      document.querySelector('.nav-item:nth-child(2)').click();
      await wait(()=>document.querySelector('.load-more button')&&!document.querySelector('.catalog-loading'));
      const initial=document.querySelectorAll('.card-title').length;
      document.querySelector('.load-more button').click();
      await wait(()=>document.querySelectorAll('.card-title').length>initial);
      return {homeCount,indexPageItems:initial,afterPagination:document.querySelectorAll('.card-title').length,realSearch:true,playback};
    })()`, true);
    await sleep(1500);
    const folder=path.join(__dirname,'../.research/screenshots');fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,'live-index.png'),(await window.webContents.capturePage()).toPNG());
    console.log('LIVE_APP_PASSED',JSON.stringify(result));
    window.close(); app.quit();
  } catch(error) { console.error('LIVE_APP_FAILED',error.message); app.exit(1); }
});
