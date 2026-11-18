// Deterministic renderer regressions. No external streams and no OS clipboard writes.
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const {buildPlaybackDiagnostic}=require('../electron/diagnostics.cjs');
const calls={},copied=[];
const item={id:'one:20240001',remote:true,title:'播放故障回归测试',en:'TEST',image:'',score:null,year:'2024',country:'日本',type:'日韩动漫',episodes:1,episodeNumbers:[1],description:'本地模拟媒体事件',status:'测试',color:'#777'};
app.on('window-all-closed',()=>{});
ipcMain.handle('window:state',()=>({maximized:false}));
ipcMain.handle('sources:load',()=>({}));
ipcMain.handle('catalog:browse',()=>({data:{items:[item],nextCursor:null,page:1}}));
ipcMain.handle('catalog:detail',()=>({data:item}));
ipcMain.handle('catalog:resolve',(event,_id,_episode,refresh)=>{
  const name=new URL(event.sender.getURL()).searchParams.get('case');
  const history=calls[name]||=[];history.push(refresh);
  return {data:name==='refresh'?[history.length===1?'https://expired.example/1.mp4':'https://fresh.example/1.mp4']:[`https://first-${name}.example/1.mp4`,`https://second-${name}.example/1.mp4`]};
});
ipcMain.handle('playback:copy-diagnostic',(_event,payload)=>{copied.push(buildPlaybackDiagnostic(payload,'1.2.0'));return{ok:true};});
app.whenReady().then(async()=>{
  try{
    for(const name of ['timeout','stutter','pause','manual','refresh','resume-init','rollback','restart']){
      const window=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'resilience-'+name,backgroundThrottling:false}});
      await window.loadFile(path.join(__dirname,'../dist/index.html'),{query:{case:name}});
      await window.webContents.executeJavaScript(`(async()=>{
        const scenario=${JSON.stringify(name)};
        const sleep=ms=>new Promise(r=>setTimeout(r,ms));
        const until=async(fn)=>{for(let i=0;i<250;i++){if(fn())return;await sleep(20);}throw new Error(scenario+': condition timeout: '+document.body.innerText.slice(-500));};
        const assert=(condition,message)=>{if(!condition)throw new Error(scenario+': '+message);};
        const proto=HTMLMediaElement.prototype;
        Object.defineProperty(proto,'src',{configurable:true,get(){return this.dataset.testSrc||'';},set(value){this.dataset.testSrc=value;this._time=0;this._paused=true;}});
        Object.defineProperty(proto,'currentTime',{configurable:true,get(){return this._time||0;},set(value){this._time=value;}});
        Object.defineProperty(proto,'paused',{configurable:true,get(){return this._paused!==false;}});
        Object.defineProperty(proto,'duration',{configurable:true,get(){return 600;}});
        Object.defineProperty(proto,'readyState',{configurable:true,get(){return 3;}});
        proto.load=function(){};
        proto.play=function(){this._paused=false;this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));return Promise.resolve();};
        proto.pause=function(){this._paused=true;this.dispatchEvent(new Event('pause'));};
        const timer=window.setTimeout.bind(window),interval=window.setInterval.bind(window);
        if(scenario==='timeout'||scenario==='pause')window.setTimeout=(fn,ms,...args)=>timer(fn,ms===10000||ms===8000?180:ms,...args);
        const realNow=Date.now,origin=realNow();let clock=0;
        if(scenario==='stutter'){window.setInterval=(fn,ms,...args)=>interval(fn,ms===400?15:ms,...args);Date.now=()=>origin+clock;}
        await until(()=>document.querySelector('.card-title'));
        document.querySelector('.card-title').click();
        await until(()=>document.querySelector('.episode-grid button'));
        document.querySelector('.episode-grid button').click();
        await until(()=>document.querySelector('video')?.src.includes(scenario==='refresh'?'expired.example':'first-'+scenario));
        const media=document.querySelector('video');
        if(scenario==='timeout'){
          media.dispatchEvent(new Event('canplay'));
          const spam=interval(()=>media.dispatchEvent(new Event('canplay')),15);
          await until(()=>media.src.includes('second-timeout'));
          clearInterval(spam);
        }
        if(scenario==='stutter'){
          media.currentTime=1;media.dispatchEvent(new Event('canplay'));
          for(let i=0;i<3;i++){media.dispatchEvent(new Event('waiting'));clock+=1300;media.currentTime+=0.3;media.dispatchEvent(new Event('timeupdate'));await sleep(45);}
          await until(()=>media.src.includes('second-stutter'));Date.now=realNow;
        }
        if(scenario==='pause'){
          media.dispatchEvent(new Event('canplay'));await sleep(30);media.pause();
          for(let i=0;i<10;i++){media.dispatchEvent(new Event('canplay'));await sleep(40);}
          assert(media.src.includes('first-pause'),'pause triggered source failover');assert(media.paused,'canplay forcibly resumed a paused video');
        }
        if(scenario==='manual'){
          media.currentTime=123;media.dispatchEvent(new Event('timeupdate'));
          document.querySelector('[title^="保留进度"]').click();
          await until(()=>media.src.includes('second-manual'));
          media.dispatchEvent(new Event('loadedmetadata'));assert(media.currentTime===123,'manual optimization lost position');
          document.querySelector('[title^="复制不含"]').click();
          await until(()=>document.body.innerText.includes('诊断已复制'));
        }
        if(scenario==='resume-init'){
          media.currentTime=123;media.dispatchEvent(new Event('timeupdate'));
          document.querySelector('.modal-close').click();await until(()=>!document.querySelector('[role="dialog"]'));
          document.querySelector('.card-title').click();await until(()=>document.querySelector('.episode-grid button'));
          document.querySelector('.episode-grid button').click();await until(()=>document.querySelector('video')?.src.includes('first-resume-init'));
          const resumed=document.querySelector('video');resumed.currentTime=0;resumed.dispatchEvent(new Event('seeking'));resumed.dispatchEvent(new Event('loadedmetadata'));
          assert(resumed.currentTime===123,'initial empty-media seeking erased saved progress');
        }
        if(scenario==='rollback'){
          media.currentTime=123;media.dispatchEvent(new Event('timeupdate'));document.querySelector('[title^="保留进度"]').click();
          await until(()=>media.src.includes('second-rollback'));media.dispatchEvent(new Event('error'));
          await until(()=>media.src.includes('first-rollback'));media.dispatchEvent(new Event('loadedmetadata'));
          assert(media.currentTime===123,'failed optimization did not restore the original playable position');assert(!document.querySelector('.playback-failure'),'optimization destroyed the last usable source');
        }
        if(scenario==='restart'){
          media.currentTime=123;media.dispatchEvent(new Event('timeupdate'));media.dispatchEvent(new Event('error'));
          await until(()=>media.src.includes('second-restart'));media.dispatchEvent(new Event('error'));
          await until(()=>document.querySelector('.playback-failure'));
          [...document.querySelectorAll('.playback-failure button')].find(button=>button.innerText==='从头重试').click();
          await until(()=>document.querySelector('video')?.src.includes('first-restart'));
          document.querySelector('video').dispatchEvent(new Event('loadedmetadata'));assert(document.querySelector('video').currentTime===0,'explicit restart retained the bad saved position');
        }
        if(scenario==='refresh'){
          media.dispatchEvent(new Event('error'));
          await until(()=>document.querySelector('video')?.src.includes('fresh.example'));
          document.querySelector('video').dispatchEvent(new Event('error'));
          await until(()=>document.querySelector('.playback-failure'));
          await sleep(150);
        }
        assert(!/first-[a-z]+\\.example|second-[a-z]+\\.example|expired\\.example|fresh\\.example/.test(document.body.innerText),'source details leaked into viewer text');
      })()`);
      if(name==='refresh'&&(calls.refresh.length!==2||calls.refresh[1]!==true))throw new Error('Refresh was not forced / bounded: '+JSON.stringify(calls.refresh));
      console.log('RESILIENCE_PASSED',name);window.close();
    }
    if(copied.length!==1||JSON.stringify(copied).includes('.example'))throw new Error('Unsafe diagnostics');
    app.exit(0);
  }catch(error){console.error('RESILIENCE_FAILED',error.message);app.exit(1);}
});
