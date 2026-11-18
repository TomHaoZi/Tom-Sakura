// Capture the actual renderer using original, illustrative covers and an in-memory profile.
// Only this documentation harness supplies the fixture; the shipped app uses its online catalog.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const palette = [
  ['晨樱与远方','#27223d','#f29cb3','#ffcad4','日韩动漫'],
  ['雾港来信','#182f48','#587ca4','#ffe2ba','国产动漫'],
  ['星轨收藏家','#291b4e','#8c6ed1','#f4b4ff','海外动漫'],
  ['风过青岚','#11384a','#58ad97','#e6f5bf','日韩动漫'],
  ['琥珀长夜','#30213a','#c65c60','#fbb778','欧美动漫'],
  ['月下的邮差','#1c2544','#8b8bca','#ffe3c5','国产动漫'],
];
function cover([title, dark, mid, light], i) {
  const moonX = 88 + (i % 3) * 63, moonY = 107 + (i % 2) * 36;
  const stars = Array.from({length:27},(_,n)=>`<circle cx="${(n*67+i*13)%318}" cy="${(n*29+i*9)%198}" r="${n%3===0?2:1}" fill="${light}" opacity=".65"/>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="450" viewBox="0 0 320 450">
  <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${dark}"/><stop offset=".65" stop-color="${mid}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
  <path fill="url(#sky)" d="M0 0h320v450H0z"/>${stars}
  <circle cx="${moonX}" cy="${moonY}" r="54" fill="${light}" opacity=".88"/><circle cx="${moonX}" cy="${moonY}" r="64" fill="none" stroke="${light}" opacity=".36"/>
  <path fill="${dark}" opacity=".5" d="M0 286 57 210l48 37 53-66 51 55 25-22 86 73v163H0z"/>
  <path fill="${dark}" d="M0 328 49 294l31 23 91-53 42 36 50-19 57 31v138H0z"/>
  <path fill="none" stroke="${light}" opacity=".45" d="M101 350h132m-105 13h94m-75 13h45"/>
  <path fill="${light}" d="M153 313q7-13 14 0l-3 22h-9z"/><circle cx="160" cy="303" r="5" fill="${light}"/>
  <text x="160" y="404" text-anchor="middle" fill="${light}" font-family="Microsoft YaHei, sans-serif" font-size="22">${title}</text>
  <text x="160" y="424" text-anchor="middle" fill="${light}" font-family="Segoe UI, sans-serif" font-size="8" letter-spacing="3">TOM SAKURA · UI PREVIEW</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const items = palette.map((entry,i)=>({id:`one:${91000001+i}`,remote:true,title:entry[0],image:cover(entry,i),color:entry[1],type:entry[4],year:'2026',episodes:12,episodeNumbers:Array.from({length:12},(_,n)=>n+1),status:'12 集可选',description:'界面预览用的虚构条目，使用原创占位封面，不属于客户端的在线片库。'}));
ipcMain.handle('window:state',()=>({maximized:false}));
ipcMain.handle('sources:load',()=>({}));
ipcMain.handle('catalog:browse',()=>({data:{items,nextCursor:null}}));
ipcMain.handle('catalog:detail',(_event,id)=>({data:items.find(item=>item.id===id)}));
app.whenReady().then(async()=>{
  const folder=path.join(__dirname,'../docs/screenshots');
  const win=new BrowserWindow({show:false,frame:false,width:1440,height:1080,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,partition:'docs-capture',backgroundThrottling:false}});
  const ui=code=>win.webContents.executeJavaScript(`(async()=>{const wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Screenshot UI timeout');};${code}})()`);
  const capture=async name=>{
    await new Promise(r=>setTimeout(r,700));
    const png=(await win.webContents.capturePage()).toPNG();
    await fs.writeFile(path.join(folder,name+'.png'),png);
  };
  try {
    await fs.mkdir(folder,{recursive:true});
    await win.loadFile(path.join(__dirname,'../dist/index.html'));
    await ui(`await wait(()=>document.querySelector('.hero-poster img')?.naturalWidth>0);`);
    await capture('home-light');
    await ui(`document.querySelector('.settings-nav').click();await wait(()=>document.querySelector('.appearance-segments'));document.querySelector('.appearance-segments button:nth-child(2)').click();await wait(()=>document.documentElement.dataset.theme==='dark');document.querySelector('.modal-close').click();await wait(()=>!document.querySelector('[role="dialog"]'));document.querySelector('.hero-poster').click();await wait(()=>document.querySelector('.episode-grid button'));`);
    await capture('episode-dark');
    await ui(`document.querySelector('.modal-close').click();await wait(()=>!document.querySelector('[role="dialog"]'));document.querySelector('.settings-nav').click();await wait(()=>document.querySelector('.settings-modal'));const select=document.querySelector('[aria-label="默认播放策略"]');select.value='quality';select.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>JSON.parse(localStorage.getItem('ts-preferences')).strategy==='quality');`);
    await capture('settings-quality');
    console.log('Documentation screenshots:',folder);
    app.exit(0);
  } catch(error){console.error(error);app.exit(1);}
});
