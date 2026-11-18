// Windows-only smoke: inspect the real ASAR, launch the actual EXE, then close it.
// Does NOT install software, touch uninstall registration, or delete user app data.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const assert = require('node:assert/strict');
const root = path.join(__dirname,'../release',require('../package.json').version,'win-unpacked');
const exe = path.join(root,'Tom Sakura.exe');
const archive = path.join(root,'resources/app.asar');
const pkg = JSON.parse(asar.extractFile(archive,'package.json').toString());
assert.equal(pkg.version,require('../package.json').version);
for(const file of ['electron/main.cjs','electron/one-catalog.cjs','electron/content-service.cjs','assets/icon.png','dist/index.html','node_modules/cheerio/package.json']) assert.ok(asar.statFile(archive,path.normalize(file)));
const child = spawn(exe,['--user-data-dir='+path.join(__dirname,'../.research/package-profile')],{stdio:['ignore','ignore','pipe']});
let errorOutput=''; child.stderr.on('data',chunk=>{errorOutput=(errorOutput+chunk).slice(-1000);});
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const command = code => execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
(async()=>{
  try {
    let title='';
    for(let i=0;i<25;i++) {
      if(child.exitCode!==null) throw new Error('Desktop exited before opening: '+child.exitCode);
      title=command(`$p=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if($p){$p.MainWindowTitle}`);
      if(title.startsWith('Tom Sakura')) break;
      await sleep(400);
    }
    assert.ok(title.startsWith('Tom Sakura'),'No branded desktop window: '+errorOutput);
    const metadata=command(`(Get-Item -LiteralPath '${exe.replace(/'/g,"''")}').VersionInfo.ProductName`);
    assert.equal(metadata,'Tom Sakura');
    command(`$p=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if($p){[void]$p.CloseMainWindow()}`);
    for(let i=0;i<80&&child.exitCode===null;i++) await sleep(100);
    assert.equal(child.exitCode,0,'Desktop did not close cleanly');
    console.log('PACKAGE_SMOKE_PASSED',JSON.stringify({version:pkg.version,product:metadata,realExeStarted:true,cleanExit:true}));
  } catch(error) { console.error('PACKAGE_SMOKE_FAILED',error.message); if(child.exitCode===null)child.kill();process.exitCode=1; }
})();
