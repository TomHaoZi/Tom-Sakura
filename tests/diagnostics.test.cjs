const {test}=require('node:test');const assert=require('node:assert/strict');
const {buildPlaybackDiagnostic}=require('../electron/diagnostics.cjs');
test('diagnostic clipboard output excludes addresses, cookies, tokens and arbitrary error strings',()=>{
  const data=buildPlaybackDiagnostic({title:'Test https://cdn.example/x?token=SECRET',episode:3,phase:'buffering',source:'https://cdn.example/?token=SECRET',cookies:'PRIVATE',errors:{network:2,SECRET:7},lastError:'https://secret.example/private',attempts:5},'1.2.0');
  const serialized=JSON.stringify(data);
  assert.equal(data.version,'1.2.0');assert.equal(data.attempts,5);assert.equal(data.errors.network,2);
  for(const term of ['SECRET','PRIVATE','cdn.example','secret.example','cookies','token'])assert.equal(serialized.includes(term),false);
});
test('malformed diagnostic data cannot produce unbounded clipboard output',()=>{
  const data=buildPlaybackDiagnostic({title:'x'.repeat(100000),episode:-5,width:Infinity,errors:{network:NaN},phase:{}},'1.2.0');
  assert.ok(JSON.stringify(data).length<2000);assert.equal(data.episode,0);assert.equal(data.width,0);
});
