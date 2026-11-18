const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let appearance;
test.before(async () => { appearance = await import('../src/appearance.js'); });
test('appearance defaults are safe for absent or corrupt stored values', () => {
  for (const value of [null, undefined, false, 12, 'dark', [], {theme:'unknown',reduceTransparency:'true'}])
    assert.deepEqual(appearance.normalizeAppearance(value), {theme:'light',reduceTransparency:false});
});
test('only supported appearance fields are persisted', () => {
  assert.deepEqual(appearance.normalizeAppearance({theme:'system',reduceTransparency:true,token:'private'}), {theme:'system',reduceTransparency:true});
  assert.deepEqual(appearance.normalizeAppearance({theme:'dark',reduceTransparency:false}), {theme:'dark',reduceTransparency:false});
});
test('solid material text and primary button gradient stops have at least 4.5:1 contrast', () => {
  const css = fs.readFileSync(path.join(__dirname,'../src/styles.css'),'utf8');
  const luminance = hex => {
    const c=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
    return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
  };
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
  for(const block of [css.match(/:root \{([^}]+)\}/)[1],css.match(/:root\[data-theme='dark'\] \{([^}]+)\}/)[1]]) {
    const color=name=>block.match(new RegExp('--'+name+': (#[0-9a-f]{6});'))[1];
    for(const name of ['text','muted','quiet','accent']) assert.ok(ratio(color(name),color('surface-solid'))>=4.5,name+' contrast');
    for(const stop of block.match(/--primary: ([^;]+);/)[1].match(/#[0-9a-f]{6}/g)) assert.ok(ratio(stop,'#ffffff')>=4.5,'button contrast');
  }
});
test('system appearance follows OS changes without overriding explicit choices', () => {
  assert.equal(appearance.resolvedTheme({theme:'system'},true),'dark');
  assert.equal(appearance.resolvedTheme({theme:'system'},false),'light');
  assert.equal(appearance.resolvedTheme({theme:'light'},true),'light');
  assert.equal(appearance.resolvedTheme({theme:'dark'},false),'dark');
});
