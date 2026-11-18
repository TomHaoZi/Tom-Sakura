// Real sandboxed UI with deterministic catalog/media, no remote dependency.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const item = { id:'one:20240001', remote:true, title:'为了检查长标题、布局与玻璃材质而准备的桌面界面回归测试', en:'YOUR NEXT STORY', image:'', score:null, year:'2024', type:'日韩动漫', country:'日本', episodes:2, episodeNumbers:[1,2], status:'2 集可选', description:'用于界面测试的较长简介。'.repeat(20), color:'#64769e' };
const actions = [];
ipcMain.handle('window:state',()=>({maximized:false}));
ipcMain.on('window:action',(_event,action)=>actions.push(action));
ipcMain.handle('sources:load',()=>({}));
ipcMain.handle('catalog:browse',()=>({data:{items:[item],nextCursor:null}}));
ipcMain.handle('catalog:detail',()=>({data:item}));
ipcMain.handle('catalog:resolve',()=>({data:['https://example.invalid/test.mp4']}));
app.whenReady().then(async()=>{
  const errors=[];
  const window = new BrowserWindow({show:false,frame:false,width:1440,height:940,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'appearance-smoke'}});
  const run = code => window.webContents.executeJavaScript(`(async()=>{const wait=async(fn)=>{for(let n=0;n<150;n++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error('Appearance UI wait timeout');};const assert=(v,m)=>{if(!v)throw new Error(m);};${code}})()`,true);
  const emulate = (color,motion='no-preference') => window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:color},{name:'prefers-reduced-motion',value:motion}]});
  window.webContents.on('preload-error',(_e,_p,error)=>errors.push(error.message));
  try {
    window.webContents.debugger.attach('1.3');
    window.webContents.debugger.sendCommand('Runtime.enable').catch(error=>errors.push(error.message));
    window.webContents.debugger.on('message',(_e,method,params)=>{if(method==='Runtime.exceptionThrown')errors.push(params.exceptionDetails.text);});
    await window.loadFile(path.join(__dirname,'../dist/index.html'));
    await emulate('dark');
    await run(`
      await wait(()=>document.querySelector('.card-title'));
      assert(document.documentElement.dataset.theme==='light','default is not pearl glass');
      assert(document.querySelectorAll('.hero-pagination button').length===1,'invented hero pages');
      assert(document.querySelector('.hero-pagination b').innerText.replace(/\\s/g,'')==='01/01','wrong hero count');
      assert(!document.querySelector('.complete-dot'),'unverified green availability status');
      assert(document.querySelector('.version').innerText==='v${require('../package.json').version.split('.').slice(0,2).join('.')}','visible version mismatch');
      for(const action of ['minimize','maximize','close'])document.querySelector('.traffic.'+action).click();
      localStorage.setItem('ts-preferences',JSON.stringify({autoNext:false,rate:1.5,strategy:'quality'}));
      document.querySelector('.settings-nav').focus();document.querySelector('.settings-nav').click();
      await wait(()=>document.querySelector('.appearance-segments'));
      document.querySelector('.appearance-segments button:nth-child(2)').click();
      await wait(()=>document.documentElement.dataset.theme==='dark');
      document.querySelector('[aria-label="减少透明度"]').click();
      await wait(()=>document.documentElement.dataset.reducedTransparency==='true');
      assert(getComputedStyle(document.querySelector('.sidebar')).backdropFilter==='none','reduced sidebar still blurs');
      assert(getComputedStyle(document.querySelector('.settings-modal')).backdropFilter==='none','reduced sheet still blurs');
      assert(document.querySelector('[role="dialog"]').contains(document.activeElement),'settings focus escaped');
    `);
    assert.deepEqual(actions,['minimize','maximize','close']);
    await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.reload();});
    await run(`
      await wait(()=>document.querySelector('.card-title'));
      assert(document.documentElement.dataset.theme==='dark','dark choice lost on reload');
      assert(document.documentElement.dataset.reducedTransparency==='true','reduced material lost on reload');
      assert(JSON.parse(localStorage.getItem('ts-preferences')).rate===1.5,'appearance changed playback prefs');
      document.querySelector('.settings-nav').focus();document.querySelector('.settings-nav').click();
      await wait(()=>document.querySelector('.appearance-segments'));
      document.querySelector('[aria-label="减少透明度"]').click();
      document.querySelector('.appearance-segments button:nth-child(3)').click();
      await wait(()=>document.documentElement.dataset.theme==='dark');
    `);
    await emulate('light','reduce');
    await run(`
      await wait(()=>document.documentElement.dataset.theme==='light');
      assert(getComputedStyle(document.querySelector('.anime-card')).animationName==='none','reduced motion ignored');
      document.querySelector('.modal-close').click();
      await wait(()=>!document.querySelector('[role="dialog"]'));
      assert(document.activeElement.classList.contains('settings-nav'),'settings did not restore focus');
    `);
    window.setContentSize(1000,680);
    await run(`
      await new Promise(r=>setTimeout(r,150));
      assert(document.documentElement.scrollWidth<=innerWidth,'window overflows horizontally');
      const main=document.querySelector('main');assert(main.scrollWidth<=main.clientWidth,'content overflows horizontally');
      const controls=document.querySelector('.hero-buttons').getBoundingClientRect(), footer=document.querySelector('.hero-bottom').getBoundingClientRect();
      assert(controls.bottom+5<footer.top,'long hero title overlaps footer');
      document.querySelector('.settings-nav').click();await wait(()=>document.querySelector('.settings-modal'));
      const sheet=document.querySelector('.settings-modal').getBoundingClientRect();
      assert(sheet.top>=0&&sheet.bottom<=innerHeight,'small-window sheet escapes viewport');
      document.querySelector('.modal-close').click();await wait(()=>!document.querySelector('[role="dialog"]'));
      Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,get(){return this.dataset.testSrc||'';},set(value){this.dataset.testSrc=value;}});
      HTMLMediaElement.prototype.load=function(){};HTMLMediaElement.prototype.play=function(){return Promise.resolve();};HTMLMediaElement.prototype.pause=function(){};
      document.querySelector('.card-title').click();await wait(()=>document.querySelector('.episode-grid button'));
      document.querySelector('.episode-grid button').click();await wait(()=>document.querySelector('video'));
      assert(document.documentElement.dataset.cinema==='true','cinema simplification not enabled');
      assert(getComputedStyle(document.querySelector('.detail-modal')).backdropFilter==='none','cinema sheet still has large blur');
      assert(getComputedStyle(document.querySelector('video')).filter==='none','video pixels were filtered');
      document.querySelector('.modal-close').click();await wait(()=>document.documentElement.dataset.cinema==='false');
    `);
    window.setContentSize(800,600);
    await run(`
      await new Promise(r=>setTimeout(r,150));
      const main=document.querySelector('main');assert(main.scrollWidth<=main.clientWidth,'small-display horizontal overflow');
      const settings=document.querySelector('.settings-nav').getBoundingClientRect();assert(settings.bottom<=innerHeight,'small-display settings clipped');
      assert(getComputedStyle(document.querySelector('.hero-poster')).display==='none','small-display poster overlaps hero copy');
    `);
    assert.deepEqual(errors,[]);
    console.log('APPEARANCE_SMOKE_PASSED light/dark/system, persistence, native actions, focus, reduced transparency/motion, long titles, 1000×680, unfiltered video');
    app.exit(0);
  } catch(error) { console.error('APPEARANCE_SMOKE_FAILED',error.stack);app.exit(1); }
});
