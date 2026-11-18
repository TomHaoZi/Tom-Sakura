const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHttpClient } = require('../electron/http-client.cjs');
test('fixed-origin reader rejects redirects and arbitrary paths', async () => {
  let calls=0;
  const read=createHttpClient('https://safe.example',async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.example/'}});},path=>path==='/');
  await assert.rejects(read('https://evil.example/')); assert.equal(calls,0);
  await assert.rejects(read('/private')); assert.equal(calls,0);
  await assert.rejects(read('/')); assert.equal(calls,1);
});
test('oversized responses are stopped, not stored', async () => {
  let calls=0;
  const read=createHttpClient('https://safe.example',async()=>{calls++;return new Response('x'.repeat(2*1024*1024+1));},()=>true);
  await assert.rejects(read('/')); await assert.rejects(read('/')); assert.equal(calls,2);
});
test('explicit retry bypasses even a just-created cached signed URL',async()=>{
  let serial=0;const policies=[];
  const read=createHttpClient('https://safe.example',async(_url,options)=>{policies.push(options.cache);return new Response(String(++serial));},()=>true);
  assert.equal(await read('/'),'1');assert.equal(await read('/'),'1');
  assert.equal(await read('/',{refresh:true}),'2');assert.equal(policies.at(-1),'reload');
});
test('parallel reads share an in-flight response', async () => {
  let calls=0;
  const read=createHttpClient('https://safe.example',async()=>{calls++;return new Response('ok');},()=>true);
  assert.deepEqual(await Promise.all([read('/'),read('/')]),['ok','ok']); assert.equal(calls,1);
});
