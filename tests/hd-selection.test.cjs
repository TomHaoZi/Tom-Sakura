const {test}=require('node:test');
const assert=require('node:assert/strict');
const player=()=>import('../src/source-probe.js');
const low='https://low.example/master.m3u8', hd='https://hd.example/master.m3u8';
const entry=(bps,res,variant)=>`#EXT-X-STREAM-INF:BANDWIDTH=${bps},RESOLUTION=${res}\n${variant}.m3u8\n`;
const master='#EXTM3U\n'+entry(350000,'640x360','base')+entry(2000000,'1920x1080','high');
const baseOnly='#EXTM3U\n'+entry(350000,'640x360','base');
const media='#EXTM3U\n#EXTINF:10,\nintro.ts\n#EXTINF:10,\nlater.ts\n#EXTINF:10,\nnext.ts\n#EXT-X-ENDLIST';
const fixture=({broken=false,seen=[]}={})=>async url=>{
  seen.push(url);
  if(url.endsWith('master.m3u8'))return new Response(url===hd?master:baseOnly);
  if(url.endsWith('high.m3u8'))return new Response(media.replaceAll('.ts','-hd.ts'));
  if(url.endsWith('base.m3u8'))return new Response(media);
  if(broken&&url.endsWith('next-hd.ts'))return new Response(null,{status:404});
  return new Response(new Uint8Array(65536));
};
test('quality selection checks HD at the resume offset within the original byte budget',async()=>{
  const {probeHls,PROBE_BYTES}=await player();const seen=[];
  const result=await probeHls(hd,{strategy:'quality',position:15,fetcher:fixture({seen}),now:()=>0});
  assert.equal(result.pixels,640*360);assert.equal(result.detail.pixels,1920*1080);
  assert.equal(result.bytes+result.detail.bytes,PROBE_BYTES);
  assert.ok(seen.some(url=>url.endsWith('later-hd.ts'))&&seen.some(url=>url.endsWith('next-hd.ts')));
  assert.ok(!seen.some(url=>url.includes('intro')));
});
test('a broken high rendition does not blacklist its healthy baseline',async()=>{
  const {probeHls}=await player();
  const result=await probeHls(hd,{strategy:'quality',position:15,fetcher:fixture({broken:true})});
  assert.equal(result.ok,true);assert.equal(result.hard,false);assert.equal(result.detail,undefined);
});
test('quality mode compares a healthy HD candidate even with a prior smooth cache hit',async()=>{
  const {chooseCandidate}=await player();const {PlaybackHealth}=await import('../src/playback.js');
  const health=new PlaybackHealth();health.record(low,true);
  health.probe(low,{ok:true,positionBucket:0,bitrate:350000,throughput:8000000});
  assert.equal(await chooseCandidate([low,hd],{strategy:'quality',fetcher:fixture(),health}),hd);
});
test('verified high resolution is rewarded only if the estimated bandwidth can sustain it',async()=>{
  const {probeScore}=await player();
  const base={pixels:640*360,bitrate:350000,throughput:4000000};
  const detail={pixels:1920*1080,bitrate:2800000,throughput:4800000};
  assert.ok(probeScore({...base,detail},{strategy:'quality'})<probeScore(base,{strategy:'quality'}));
  assert.equal(probeScore({...base,detail},{strategy:'quality',rate:2}),probeScore(base,{strategy:'quality',rate:2}));
  assert.equal(probeScore({...base,detail},{strategy:'smooth'}),probeScore(base,{strategy:'smooth'}));
});
