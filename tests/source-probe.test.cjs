const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/source-probe.js');
const body='#EXTM3U\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n';
test('parses relative fragments and chooses a supported low-bandwidth rendition',async()=>{
  const {parsePlaylist}=await load();
  assert.equal(parsePlaylist(body,'https://a.example/p/index.m3u8').segment,'https://a.example/p/segment.ts');
  const master='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=90000,CODECS="hvc1.1"\nh265.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200000,CODECS="avc1.42e01e"\navc.m3u8';
  assert.equal(parsePlaylist(master,'https://a.example/master.m3u8',type=>!type.includes('hvc1')).variant,'https://a.example/avc.m3u8');
  assert.throws(()=>parsePlaylist(master,'https://a.example/master.m3u8',()=>false));
  assert.throws(()=>parsePlaylist('<html>captcha</html>','https://a.example/'));
  assert.throws(()=>parsePlaylist('#EXTM3U\nfile:///private','https://a.example/'));
});
test('legacy decimal AVC codec names are normalized rather than falsely blocked',async()=>{
  const {parsePlaylist}=await load();let type='';
  const parsed=parsePlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,CODECS="avc1.66.30,mp4a.40.2"\nvideo.m3u8','https://a.example/master.m3u8',value=>{type=value;return value.includes('avc1.42001e');});
  assert.equal(parsed.variant,'https://a.example/video.m3u8');assert.ok(type.includes('avc1.42001e'));
});
test('an audio-only low-bitrate rendition cannot mask a broken video rendition',async()=>{
  const {parsePlaylist}=await load();
  const master='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=20000,CODECS="mp4a.40.2"\naudio.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=500000,CODECS="avc1.42e01e,mp4a.40.2",RESOLUTION=640x360\nvideo.m3u8';
  assert.equal(parsePlaylist(master,'https://a.example/master.m3u8').variant,'https://a.example/video.m3u8');
});
test('playlist HTTP 200 with a missing fragment is NOT a healthy source',async()=>{
  const {probeHls}=await load();
  const result=await probeHls('https://a.example/1.m3u8',{fetcher:async url=>url.endsWith('.m3u8')?new Response(body):new Response('',{status:404})});
  assert.equal(result.ok,false);assert.equal(result.hard,true);assert.equal(result.status,404);
});
test('fragment probing reads at most 128 KiB and avoids unnecessary Range requests',async()=>{
  const {probeHls}=await load();let canceled=false,rangeRequests=0;
  const result=await probeHls('https://a.example/1.m3u8',{fetcher:async(url,options)=>{
    if(url.endsWith('.m3u8'))return new Response(body);
    if(options.headers?.Range){rangeRequests++;return new Response('',{status:416});}
    return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(65536));},cancel(){canceled=true;}}));
  }});
  assert.equal(result.ok,true);assert.equal(result.bytes,131072);assert.equal(canceled,true);assert.equal(rangeRequests,0);
});
test('a fast verified fragment wins without waiting for a hung competitor',async()=>{
  const {chooseCandidate}=await load();const {PlaybackHealth}=await import('../src/playback.js');let aborted=false;
  const fetcher=(url,{signal})=>url.includes('slow.example')?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('abort','AbortError'));},{once:true})):Promise.resolve(new Response(url.endsWith('.m3u8')?body:new Uint8Array(1024)));
  const chosen=await chooseCandidate(['https://slow.example/1.m3u8','https://fast.example/1.m3u8'],{fetcher,health:new PlaybackHealth(),timeout:1000});
  assert.equal(chosen,'https://fast.example/1.m3u8');assert.equal(aborted,true);
});
test('all hard failures finish quickly, while soft timeouts remain eligible for actual playback',async()=>{
  const {chooseCandidate}=await load();const {PlaybackHealth}=await import('../src/playback.js');
  assert.equal(await chooseCandidate(['https://bad.example/1.m3u8'],{fetcher:async()=>new Response('',{status:403}),health:new PlaybackHealth()}),null);
  const url='https://slow.example/1.m3u8';
  assert.equal(await chooseCandidate([url],{fetcher:()=>new Promise(()=>{}),health:new PlaybackHealth(),timeout:10}),url);
});
test('parent cancellation rejects selection and prevents late winner side effects',async()=>{
  const {chooseCandidate}=await load();const controller=new AbortController();
  const promise=chooseCandidate(['https://slow.example/1.m3u8'],{signal:controller.signal,fetcher:()=>new Promise(()=>{})});
  controller.abort();await assert.rejects(promise,{name:'AbortError'});
});
test('probes the resumed position and its next fragment instead of only a healthy intro',async()=>{
  const {probeHls}=await load();const seen=[];
  const playlist='#EXTM3U\n#EXTINF:10,\na.ts\n#EXTINF:10,\nb.ts\n#EXTINF:10,\nc.ts\n#EXT-X-ENDLIST';
  const result=await probeHls('https://a.example/movie.m3u8',{position:15,fetcher:async url=>{seen.push(url);return url.endsWith('.m3u8')?new Response(playlist):url.endsWith('c.ts')?new Response('',{status:404}):new Response(new Uint8Array(1024));}});
  assert.equal(result.ok,false);assert.equal(result.status,404);assert.ok(seen.some(url=>url.endsWith('b.ts')));assert.equal(seen.some(url=>url.endsWith('a.ts')),false);
});
test('smooth selection penalizes an unsustainable high-bitrate burst and accounts for playback speed',async()=>{
  const {probeScore}=await load();
  const high={ok:true,bitrate:4000000,throughput:1500000,ms:100},low={ok:true,bitrate:500000,throughput:2000000,ms:500};
  assert.ok(probeScore(high,{rate:1.5})>probeScore(low,{rate:1.5}));
  assert.ok(probeScore({bitrate:1000000,throughput:1500000,ms:100},{rate:2})>probeScore({bitrate:1000000,throughput:1500000,ms:100},{rate:1}));
});
test('a saved-progress probe does not reuse the intro-only validation cache',async()=>{
  const {chooseCandidate}=await load();const{PlaybackHealth}=await import('../src/playback.js');const health=new PlaybackHealth();let calls=0;
  health.probe('https://a.example/movie.m3u8',{ok:true,positionBucket:0});health.record('https://a.example/movie.m3u8',true);
  const playlist='#EXTM3U\n#EXTINF:100,\na.ts\n#EXT-X-ENDLIST';
  const value=await chooseCandidate(['https://a.example/movie.m3u8'],{position:40,health,fetcher:async url=>{calls++;return new Response(url.endsWith('.m3u8')?playlist:new Uint8Array(1024));}});
  assert.equal(value,'https://a.example/movie.m3u8');assert.ok(calls>=2);
});
test('a native MP4 is not rejected just because its server omits fetch CORS',async()=>{
  const {chooseCandidate}=await load();let calls=0;
  const chosen=await chooseCandidate(['https://mp4.example/1.mp4'],{fetcher:async()=>{calls++;throw new Error('no CORS');}});
  assert.equal(chosen,'https://mp4.example/1.mp4');assert.equal(calls,0);
});
