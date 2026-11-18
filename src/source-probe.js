import {candidateList,playbackHealth} from './playback.js';
export const isHls=url=>/\.m3u8(?:$|[?#])/i.test(url);
export const PROBE_BYTES=128*1024;
const address=(value,base)=>{const url=new URL(value,base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('invalid');return url.href;};
export function parsePlaylist(text,base,supports=type=>globalThis.MediaSource?.isTypeSupported?.(type)!==false,position=0,preferDetail=false){
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(s=>s.trim());
  if(lines[0]!=='#EXTM3U')throw new Error('invalid-playlist');
  const variants=[];
  for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){
    const bandwidth=Number(lines[i].match(/(?:^|[:,])BANDWIDTH=(\d+)/)?.[1])||Infinity;
    const next=lines.slice(i+1).find(s=>s&&!s.startsWith('#'));
    const codecs=lines[i].match(/CODECS="([^"]+)"/)?.[1];
    const normalized=codecs?.split(',').map(codec=>{const value=codec.trim(),legacy=value.match(/^(avc[13])\.(\d{1,3})\.(\d{1,3})$/);return legacy&&Number(legacy[2])<=255&&Number(legacy[3])<=255?`${legacy[1]}.${Number(legacy[2]).toString(16).padStart(2,'0')}${Number(legacy[3]).toString(16).padStart(4,'0')}`:value;}).join(',');
    const size=lines[i].match(/(?:^|[:,])RESOLUTION=(\d+)x(\d+)(?=,|$)/);
    const width=Number(size?.[1])||0,height=Number(size?.[2])||0;
    const pixels=width<=8192&&height<=8192?width*height:0;
    const video=pixels>0||/(?:avc[13]|hev1|hvc1|av01|vp0[89]|dvh[1e])/.test(codecs||'');
    if(next)variants.push({url:address(next,base),bandwidth,pixels,audioOnly:!!codecs&&!video,supported:!codecs||supports(`video/mp4; codecs="${normalized}"`)});
  }
  if(variants.length){
    const hasVideo=variants.some(v=>!v.audioOnly),playable=variants.filter(v=>v.supported&&(!hasVideo||!v.audioOnly));
    if(!playable.length)throw new Error('unsupported-codec');
    const selected=playable.sort((a,b)=>(preferDetail?b.pixels-a.pixels:0)||a.bandwidth-b.bandwidth)[0];
    return{variant:selected.url,bandwidth:Number.isFinite(selected.bandwidth)?selected.bandwidth:0,pixels:selected.pixels,hasHigher:playable.some(v=>v.pixels>selected.pixels)};
  }
  let duration=0,rangeLength=0,rangeOffset=0,nextOffset=0,total=0;const segments=[];
  for(const line of lines){
    if(line.startsWith('#EXTINF:'))duration=Number(line.slice(8).split(',')[0])||0;
    if(line.startsWith('#EXT-X-BYTERANGE:')){const [length,offset]=line.slice(17).split('@');rangeLength=Number(length)||0;rangeOffset=offset===undefined?nextOffset:Number(offset)||0;}
    if(line&&!line.startsWith('#')){segments.push({segment:address(line,base),duration,rangeLength,rangeOffset,start:total});total+=duration;nextOffset=rangeOffset+rangeLength;duration=0;rangeLength=0;}
  }
  if(!segments.length)throw new Error('empty-playlist');
  if(lines.includes('#EXT-X-ENDLIST')&&total>0&&position>total+2)throw new Error('duration-mismatch');
  const selected=segments.findIndex(segment=>segment.start+segment.duration>position);
  const index=selected<0?segments.length-1:selected;
  return {...segments[index],next:segments[index+1]||null};
}
async function textBounded(response,max=1024*1024){
  if(!response.body)throw new Error('empty');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('oversize');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(data);
}
const hardStatus=status=>[401,403,404,410,429,451].includes(status);
async function probeRendition(url,{signal,fetcher,now,position,preferDetail=false,byteLimit}){
  const started=now();let next=url,declaredBitrate=0,pixels=0,hasHigher=false;
  for(let depth=0;depth<3;depth++){
    const response=await fetcher(next,{signal,credentials:'omit'});
    if(!response.ok){await response.body?.cancel();return{ok:false,hard:hardStatus(response.status),status:response.status};}
    let playlist;
    try{playlist=parsePlaylist(await textBounded(response),response.url||next,undefined,position,preferDetail);}
    catch(error){if(signal?.aborted)throw error;return{ok:false,hard:true,reason:error.message==='unsupported-codec'?'decode':'playlist'};}
    if(playlist.variant){next=playlist.variant;declaredBitrate=playlist.bandwidth||declaredBitrate;pixels=playlist.pixels||pixels;hasHigher||=playlist.hasHigher;continue;}
    const segmentStarted=now(),samples=[playlist,...(playlist.next?[playlist.next]:[])];
    const perSample=Math.floor(byteLimit/samples.length);let bytes=0,bitrate=declaredBitrate;
    // Check the requested position AND its next fragment, not just a fast intro.
    // Normal GET avoids Range quirks; only byte-range playlists require a Range.
    for(const sample of samples){
      const range=sample.rangeLength?{Range:`bytes=${sample.rangeOffset}-${sample.rangeOffset+Math.min(perSample,sample.rangeLength)-1}`}:undefined;
      const segment=await fetcher(sample.segment,{signal,credentials:'omit',...(range?{headers:range}:{})});
      if(!segment.ok){await segment.body?.cancel();return{ok:false,hard:hardStatus(segment.status),status:segment.status};}
      if(/text\/html|application\/json/i.test(segment.headers.get('content-type')||'')){await segment.body?.cancel();return{ok:false,hard:true,reason:'segment'};}
      if(!segment.body)return{ok:false,hard:true,reason:'empty'};
      const size=sample.rangeLength||Number(segment.headers.get('content-length'))||0;
      bitrate=Math.max(bitrate,sample.duration>0?size*8/sample.duration:0);
      const reader=segment.body.getReader();let sampled=0;
      try{while(sampled<perSample){const{done,value}=await reader.read();if(done)break;sampled+=Math.min(value.length,perSample-sampled);}}
      finally{await reader.cancel().catch(()=>{});}
      if(sampled<188)return{ok:false,hard:true,reason:'empty'};bytes+=sampled;
    }
    const transferMs=Math.max(1,now()-segmentStarted);
    return{ok:true,hard:false,ms:Math.round(now()-started),bytes,bitrate:Math.round(bitrate),throughput:Math.round(bytes*8000/transferMs),positionBucket:Math.floor(position/30),pixels,hasHigher};
  }
  return{ok:false,hard:true,reason:'nested-playlist'};
}
export async function probeHls(url,{signal,fetcher=(...args)=>fetch(...args),now=()=>performance.now(),position=0,strategy='smooth'}={}){
  const qualityChecked=strategy==='quality';
  const options={signal,fetcher,now,position,byteLimit:qualityChecked?PROBE_BYTES/2:PROBE_BYTES};
  const base=await probeRendition(url,options);
  if(!qualityChecked||!base.ok||!base.hasHigher)return {...base,qualityChecked};
  // Optional high rendition is strictly bounded. Its failure never marks the
  // verified baseline as unusable, even if the CDN advertises a broken HD level.
  const controller=new AbortController();
  const abort=()=>controller.abort();
  const timer=setTimeout(abort,1000);
  signal?.addEventListener('abort',abort,{once:true});
  try {
    if(signal?.aborted)abort();
    const detail=await probeRendition(url,{...options,signal:controller.signal,preferDetail:true});
    return {...base,qualityChecked,detail:detail.ok&&detail.pixels>base.pixels?detail:undefined};
  } catch { return {...base,qualityChecked}; }
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function probeScore(result,{rate=1,strategy='smooth'}={}){
  const ratio=result.bitrate>0&&result.throughput>0?result.throughput/(result.bitrate*Math.max(0.5,rate)*1.25):null;
  const insufficient=ratio!==null&&ratio<1?4+(1-ratio)*3:0;
  const weight=strategy==='smooth'?1:strategy==='balanced'?0.3:0;
  const detail=result.detail;
  const sustainable=sample=>sample?.bitrate>0&&sample.throughput>=sample.bitrate*Math.max(.5,rate)*1.25;
  const pixels=sustainable(detail)?detail.pixels:result.pixels;
  const bonus=strategy==='quality'&&sustainable(result)?Math.min(Math.max(0,Math.log2((pixels||0)/(640*360))),6)*0.48:0;
  return insufficient+(ratio===null?1:0)+weight*Math.min(result.bitrate||0,8000000)/2000000+Math.min(result.ms||0,5000)/2500-bonus;
}
// Four sandboxed CORS probes, a short comparison window, and a hard total deadline.
// A fast first byte alone must not beat a lower-bitrate, sustainable rendition.
export function chooseCandidate(input,{signal,health=playbackHealth,fetcher,timeout=5500,concurrency=4,force=false,onProbe,rate=1,strategy='smooth',settle=350,position=0}={}){
  const candidates=health.rank(candidateList(input));
  if(signal?.aborted)return Promise.reject(new DOMException('Canceled','AbortError'));
  if(!candidates.length)return Promise.resolve(null);
  const quality=strategy==='quality';
  if(!isHls(candidates[0])&&(!quality||!candidates.some(isHls)))return Promise.resolve(candidates[0]);
  const getProbe=url=>{const result=health.probeResult(url);return result?.positionBucket===Math.floor(position/30)&&(result.hard||(!quality||result.qualityChecked))?result:null;};
  const cached=getProbe(candidates[0]);
  if(!quality&&!force&&cached&&health.entry(candidates[0])?.ok===true)return Promise.resolve(candidates[0]);
  if(!quality&&!force&&cached?.ok&&probeScore(cached,{rate,strategy})<3)return Promise.resolve(candidates[0]);
  const queue=candidates.filter(url=>isHls(url)&&(force||!getProbe(url)));
  return new Promise((resolve,reject)=>{
    const controller=new AbortController();let finished=false,index=0,active=0,settleTimer;
    const successes=new Map();
    if(!force)for(const url of candidates){const result=getProbe(url);if(result?.ok)successes.set(url,result);}
    const best=()=>[...successes].sort((a,b)=>probeScore(a[1],{rate,strategy})-probeScore(b[1],{rate,strategy}))[0]?.[0];
    const fallback=()=>best()||health.rank(candidates).find(url=>!getProbe(url)?.hard)||null;
    const cleanup=()=>{clearTimeout(timer);clearTimeout(settleTimer);signal?.removeEventListener('abort',abort);controller.abort();};
    const finish=url=>{if(finished)return;finished=true;cleanup();resolve(url);};
    const abort=()=>{if(finished)return;finished=true;cleanup();reject(new DOMException('Canceled','AbortError'));};
    const timer=setTimeout(()=>finish(fallback()),timeout);
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    const run=()=>{
      if(finished)return;
      while(active<concurrency&&index<queue.length){
        const url=queue[index++];active++;
        probeHls(url,{signal:controller.signal,fetcher,position,strategy}).then(result=>{
          result.positionBucket=Math.floor(position/30);
          if(finished)return;health.probe(url,result);onProbe?.(url,result);
          if(result.ok){successes.set(url,result);if(!settleTimer)settleTimer=setTimeout(()=>{settleTimer=null;const winner=best();if(winner&&probeScore(successes.get(winner),{rate,strategy})<3)finish(winner);},probeScore(result,{rate,strategy})>=3?Math.max(settle,800):quality?Math.max(settle,1250):settle);}
        }).catch(()=>{if(!finished&&!controller.signal.aborted){const result={ok:false,hard:false,reason:'network',positionBucket:Math.floor(position/30)};health.probe(url,result);onProbe?.(url,result);}})
          .finally(()=>{active--;if(!finished){if(index>=queue.length&&active===0)finish(fallback());else run();}});
      }
      if(!active&&index>=queue.length)finish(fallback());
    };
    run();
  });
}
