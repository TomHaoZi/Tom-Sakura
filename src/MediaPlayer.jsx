import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Copy, Play } from 'lucide-react';
import { PlaybackSession, PlaybackWatchdog, StallBudget, playbackHealth, bufferedAhead, qualityCap } from './playback';
import { chooseCandidate, isHls } from './source-probe';

export default function MediaPlayer({ candidates, startAt = 0, onProgress, onEnded, demo = false, rate = 1, onRateChange, onExhausted, onRetry, strategy = 'smooth', onStrategyChange, deadline, diagnosticContext = {}, fresh = false, onRestart }) {
  const video = useRef(null), position = useRef(startAt), internalDeadline = useRef(Date.now()+45000);
  const limit = deadline || internalDeadline;
  const callbacks = useRef({}); callbacks.current = {onProgress,onEnded,onExhausted,onRetry};
  const mode = useRef(strategy); mode.current = strategy;
  const actions = useRef({});
  const stats = useRef({attempts:0,switches:0,probes:0,failedProbes:0,stalls:0,errors:{},recentErrors:[],engine:'unknown',lastError:''});
  const [retry,setRetry] = useState(0), [state,setState] = useState('checking'), [copied,setCopied] = useState('');
  const [dimensions,setDimensions]=useState(null);
  const updateDimensions=event=>{
    const {videoWidth:width,videoHeight:height}=event.currentTarget;
    setDimensions(old=>width&&height?(old?.width===width&&old?.height===height?old:{width,height}):null);
  };
  useEffect(()=>{if(video.current){video.current.defaultPlaybackRate=rate;video.current.playbackRate=rate;}},[rate]);
  useEffect(()=>{actions.current.quality?.();},[strategy]);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(''),2500);return()=>clearTimeout(timer);},[copied]);
  const copyDiagnostics = async () => {
    const media=video.current;
    const payload={...stats.current,...diagnosticContext,phase:state,strategy:mode.current,position:Math.round(position.current),buffered:Math.round(media?bufferedAhead(media):0),width:media?.videoWidth||0,height:media?.videoHeight||0,online:navigator.onLine};
    try { const result=await window.desktop?.copyPlaybackDiagnostics(payload);setCopied(result?.ok?'诊断已复制':'复制失败'); } catch {setCopied('复制失败');}
  };
  useEffect(()=>{
    const media=video.current, session=new PlaybackSession(candidates,playbackHealth);
    const attempted=new Set();
    let destroyed=false,generation=0,hls,watchdog,probeAbort,budgetTimer;
    let removeEvents=()=>{},ended=false,lastSaved=position.current,forceProbes=fresh||retry>0,rollback=null;
    const active=id=>!destroyed&&id===generation;
    const transition=value=>{if(!destroyed)setState(value);};
    const error=reason=>{stats.current.lastError=reason;stats.current.errors[reason]=(stats.current.errors[reason]||0)+1;};
    const detach=()=>{
      clearTimeout(budgetTimer);probeAbort?.abort();watchdog?.dispose();
      window.desktop?.setPlaybackActive(false);
      removeEvents();removeEvents=()=>{};
      if(hls){hls.destroy();hls=undefined;}
      media.pause();media.removeAttribute('src');media.load();
      actions.current={};
    };
    const exhaust=reason=>{
      detach(); transition('failed'); error(reason);
      for(const url of session.remaining)if(playbackHealth.probeResult(url)?.hard)attempted.add(url);
      callbacks.current.onExhausted?.(position.current,{attempted:[...attempted],reason,diagnostic:{...stats.current,strategy:mode.current}});
    };
    const restoreOriginal=()=>{
      if(!rollback||destroyed)return false;
      const original=rollback;rollback=null;
      if(session.candidates.indexOf(original,session.index)<0)session.candidates.splice(session.index,0,original);else session.prefer(original);
      if(limit.current!==null&&Date.now()>=limit.current)limit.current=Date.now()+10000;
      forceProbes=false;load();return true;
    };
    const load=async()=>{
      const id=++generation;detach();
      if(limit.current===null)limit.current=Date.now()+30000;
      if(Date.now()>=limit.current){if(!restoreOriginal())exhaust('budget');return;}
      if(!session.current){if(!restoreOriginal())exhaust('exhausted');return;}
      setDimensions(null);transition('checking');probeAbort=new AbortController();
      const preparationTimer=setTimeout(()=>probeAbort?.abort(),Math.max(1,limit.current-Date.now()));
      let url;
      try {
        url=await chooseCandidate(session.remaining,{signal:probeAbort.signal,force:forceProbes,rate:media.playbackRate||1,strategy:mode.current,position:position.current,timeout:Math.min(5500,Math.max(1,limit.current-Date.now())),onProbe:(address,result)=>{
          if(!active(id))return;forceProbes=false;stats.current.probes++;if(!result.ok)stats.current.failedProbes++;if(result.hard)attempted.add(address);
        }});
      } catch { if(active(id)&&!restoreOriginal())exhaust('budget'); return; }
      finally { clearTimeout(preparationTimer); }
      if(!active(id))return;
      if(!url){if(!restoreOriginal())exhaust('unavailable');return;}
      session.prefer(url);attempted.add(url);stats.current.attempts++;
      transition(session.index?'recovering':'connecting');
      const resumeTarget=Math.max(0,position.current);
      let failed=false,hasPlayed=false,requestedPlay=false,resumePending=resumeTarget>0;
      let mediaRecovery=false,downgraded=false,confirmedAt=0,pauseAt=null;
      let previous=position.current,lastAdvanceAt=Date.now(),lastMeaningful=position.current,stableSince=Date.now(),realProgress=0;
      const stall=new StallBudget();
      const fail=reason=>{
        if(!active(id)||failed)return;failed=true;
        if(!resumePending&&Number.isFinite(media.currentTime)&&media.currentTime>0)position.current=media.currentTime;
        error(reason);stats.current.switches++;
        const ranges=[];try{const b=media.buffered;for(let i=0;i<Math.min(6,b.length);i++)ranges.push([b.start(i),b.end(i)]);}catch{}
        stats.current.recentErrors.push({reason,time:media.currentTime,buffered:bufferedAhead(media),ranges,level:hls?.currentLevel,startPosition:hls?.startPosition,streamState:hls?.streamController?.state,readyState:media.readyState,paused:media.paused,seeking:media.seeking,resumePending,hasPlayed});stats.current.recentErrors=stats.current.recentErrors.slice(-6);
        playbackHealth.record(url,false,reason);session.fail();load();
      };
      const armBudget=()=>{clearTimeout(budgetTimer);if(limit.current!==null)budgetTimer=setTimeout(()=>fail('budget'),Math.max(1,limit.current-Date.now()));};
      watchdog=new PlaybackWatchdog(()=>fail(hasPlayed?'stall-timeout':'connect-timeout'),{connect:mode.current==='smooth'?10000:15000,stall:mode.current==='smooth'?8000:12000});
      armBudget();watchdog.connecting();
      const applyQuality=(urgent=false)=>{
        if(!hls?.levels?.length)return false;
        const cap=qualityCap(hls.levels,mode.current,urgent);
        hls.autoLevelCapping=cap;
        if(urgent&&cap>=0&&cap<hls.currentLevel){hls.nextLevel=cap;hls.nextAutoLevel=cap;return true;}
        return false;
      };
      const slow=()=>{
        if(!downgraded&&applyQuality(true)){downgraded=true;stall.reset();watchdog.seeking();transition('recovering');return;}
        fail('repeated-stall');
      };
      actions.current={quality:()=>{applyQuality();watchdog.connect=mode.current==='smooth'?10000:15000;watchdog.stall=mode.current==='smooth'?8000:12000;},optimize:()=>{
        if(applyQuality(true)){downgraded=true;stall.reset();watchdog.seeking();return;}
        if(session.remaining.length<=1&&callbacks.current.onRetry){callbacks.current.onProgress?.(position.current);callbacks.current.onRetry();return;}
        rollback=url;fail('manual');
      }};
      const requestPlay=()=>{
        const promise=media.play();
        promise?.catch(reason=>{
          if(!active(id))return;
          if(reason.name==='NotAllowedError'){watchdog.pause();clearTimeout(budgetTimer);pauseAt=Date.now();transition('paused');}
          else if(reason.name!=='AbortError')fail('decode');
        });
      };
      const canplay=()=>{ // A canplay event is NOT evidence that time is advancing.
        metadata();
        if(!requestedPlay){requestedPlay=true;requestPlay();}
      };
      const metadata=()=>{
        if(!resumePending)return;
        if(hls){
          const target=Number.isFinite(media.duration)?Math.min(resumeTarget,Math.max(0,media.duration-0.5)):resumeTarget;
          if(hls.latestLevelDetails?.live||(media.readyState>=2&&media.currentTime>=target-0.5))resumePending=false;
        }else if(media.readyState>=1&&Number.isFinite(media.duration)&&media.duration>0){media.currentTime=Math.min(resumeTarget,Math.max(0,media.duration-0.5));resumePending=false;}
        if(!resumePending){previous=media.currentTime;lastMeaningful=media.currentTime;}
      };
      const timeupdate=()=>{
        if(resumePending||media.seeking||!Number.isFinite(media.currentTime))return;
        position.current=media.currentTime;
        if(Math.abs(position.current-lastSaved)>=3){lastSaved=position.current;callbacks.current.onProgress?.(position.current);}
      };
      const sample=()=>{
        if(!active(id)||failed||resumePending||media.paused||media.seeking||media.ended)return;
        const now=Date.now(),ct=media.currentTime;
        if(ct>previous+0.1&&media.readyState>=2){
          realProgress+=Math.min(ct-previous,2);previous=ct;lastAdvanceAt=now;position.current=ct;
          if(ct-lastMeaningful>=0.2){watchdog.progress();lastMeaningful=ct;}
          if(stall.start!==null)stableSince=now;
          if(stall.end()){slow();return;}
          if(realProgress>6&&now-stableSince>8000&&media.videoWidth===0){fail('decode');return;}
          transition('ready');
          if(now-stableSince>=5000&&realProgress>=2){
            clearTimeout(budgetTimer);limit.current=null;
            if(now-confirmedAt>=15000){playbackHealth.record(url,true);confirmedAt=now;}
          }
        } else if(now-lastAdvanceAt>900){stableSince=now;stall.begin();transition('buffering');if(stall.exceeded())slow();}
      };
      const play=()=>{
        if(ended){previous=media.currentTime;lastMeaningful=media.currentTime;lastAdvanceAt=Date.now();stableSince=Date.now();realProgress=0;stall.reset();}
        if(pauseAt!==null){if(limit.current!==null)limit.current+=Date.now()-pauseAt;pauseAt=null;armBudget();}
        lastAdvanceAt=Date.now();stableSince=Date.now();watchdog.connecting();
      };
      const playing=()=>{hasPlayed=true;ended=false;window.desktop?.setPlaybackActive(true);callbacks.current.onProgress?.(position.current);};
      const waiting=()=>{
        if(media.paused||media.ended||media.seeking)return;
        if(stall.start===null)stats.current.stalls++;
        stableSince=Date.now();stall.begin();watchdog.waiting();transition(hasPlayed?'buffering':'connecting');if(stall.exceeded())slow();
      };
      const pause=()=>{window.desktop?.setPlaybackActive(false);if(hasPlayed||requestedPlay){pauseAt=Date.now();stall.pause();watchdog.pause();clearTimeout(budgetTimer);transition('paused');}};
      const seeking=()=>{
        if(!resumePending&&Number.isFinite(media.currentTime))position.current=media.currentTime;
        previous=media.currentTime;lastMeaningful=media.currentTime;lastAdvanceAt=Date.now();stableSince=Date.now();realProgress=0;stall.reset();
        if(!media.paused)watchdog.seeking();
      };
      const endedHandler=()=>{ended=true;window.desktop?.setPlaybackActive(false);watchdog.ready();clearTimeout(budgetTimer);position.current=0;callbacks.current.onProgress?.(0);callbacks.current.onEnded?.();};
      const handlers={loadedmetadata:metadata,durationchange:metadata,seeked:metadata,canplay,timeupdate,play,playing,waiting,stalled:waiting,pause,seeking,ended:endedHandler,error:()=>fail(media.error?.code===3||media.error?.code===4?'decode':'network')};
      for(const [event,handler]of Object.entries(handlers))media.addEventListener(event,handler);
      const interval=setInterval(sample,400);
      removeEvents=()=>{clearInterval(interval);for(const [event,handler]of Object.entries(handlers))media.removeEventListener(event,handler);};
      // Chromium may advertise native HLS as "maybe" while leaving seeking and
      // network recovery opaque. Prefer the managed MSE engine on desktop.
      if(isHls(url)){
        import('hls.js').then(({default:Hls})=>{
          if(!active(id)||failed)return;
          if(!Hls.isSupported()){
            if(media.canPlayType('application/vnd.apple.mpegurl')){stats.current.engine='native-hls';media.src=url;media.load();}
            else fail('decode');
            return;
          }
          const retryPolicy={maxNumRetry:1,retryDelayMs:250,maxRetryDelayMs:500};
          const policy=(ttfb,total)=>({default:{maxTimeToFirstByteMs:ttfb,maxLoadTimeMs:total,timeoutRetry:{...retryPolicy,maxNumRetry:0},errorRetry:retryPolicy}});
          stats.current.engine='hls-js';
          hls=new Hls({enableWorker:true,progressive:true,autoStartLoad:false,startPosition:resumeTarget,startLevel:-1,abrEwmaDefaultEstimate:400000,abrBandWidthFactor:0.7,abrBandWidthUpFactor:0.5,maxBufferLength:60,maxMaxBufferLength:90,backBufferLength:20,maxBufferSize:48*1024*1024,maxBufferHole:0.3,
            manifestLoadPolicy:policy(4000,7000),playlistLoadPolicy:policy(4000,7000),fragLoadPolicy:policy(6000,15000),keyLoadPolicy:policy(4000,7000)});
          hls.on(Hls.Events.MANIFEST_PARSED,()=>{applyQuality();const levels=hls.levels;let lowest=-1;for(let i=0;i<levels.length;i++)if(lowest<0||levels[i].bitrate<levels[lowest].bitrate)lowest=i;if(lowest>=0)hls.startLevel=lowest;hls.startLoad(resumeTarget);});
          hls.on(Hls.Events.LEVEL_LOADED,(_event,data)=>{if(resumePending&&data.details?.live){resumePending=false;previous=media.currentTime;lastMeaningful=media.currentTime;}else metadata();});
          hls.on(Hls.Events.ERROR,(_event,data)=>{
            if(!active(id)||failed)return;
            if(data.fatal){
              if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&!mediaRecovery){mediaRecovery=true;error('decode-recovery');watchdog.seeking();hls.recoverMediaError();}
              else fail(data.type===Hls.ErrorTypes.MEDIA_ERROR?'decode':'network');
            }else if(data.details===Hls.ErrorDetails.BUFFER_STALLED_ERROR)waiting();
          });
          hls.loadSource(url);hls.attachMedia(media);
        }).catch(()=>{if(active(id))fail('decode');});
      }else{stats.current.engine='native';media.src=url;media.load();}
    };
    load();
    return()=>{destroyed=true;generation++;detach();if(!ended&&position.current>0)callbacks.current.onProgress?.(position.current);};
  },[candidates,retry]);

  return <>
    <video ref={video} controls controlsList="nodownload noremoteplayback noplaybackrate" playsInline onLoadedMetadata={updateDimensions} onResize={updateDimensions} onEmptied={()=>setDimensions(null)} onRateChange={e=>onRateChange?.(e.currentTarget.playbackRate)} aria-label={demo?'公开测试视频播放器':'番剧播放器'}/>
    {demo&&<span className="demo-label">公开播放器测试素材 · 非本番正片</span>}
    <div className="player-assist">{dimensions&&['ready','paused','buffering'].includes(state)&&<span className="decoded-resolution" title="当前解码画面尺寸，不代表原生制作分辨率">{dimensions.width}×{dimensions.height}</span>}<select aria-label="播放策略" value={strategy} onChange={e=>onStrategyChange?.(e.target.value)} title="画质优先会比较可持续的高清候选；仍可自动降码率或切换"><option value="smooth">流畅优先</option><option value="balanced">均衡</option><option value="quality">画质优先</option></select><button disabled={['checking','failed'].includes(state)} onClick={()=>actions.current.optimize?.()} title="保留进度，尝试优化或切换可用视频，不显示线路"><RefreshCw size={13}/>优化播放</button><button onClick={copyDiagnostics} title="复制不含源地址和令牌的播放诊断"><Copy size={13}/>{copied||'复制诊断'}</button></div>
    {['checking','connecting','recovering','buffering'].includes(state)&&<div className="playback-status" role="status"><RefreshCw size={19}/><span>{state==='checking'?'正在选择顺畅的视频…':state==='recovering'?'正在恢复播放…':state==='buffering'?'正在缓冲并优化…':'正在连接视频…'}</span></div>}
    {state==='paused'&&<button className="playback-resume" onClick={()=>video.current?.play().catch(()=>{})}><Play size={18}/>点击继续播放</button>}
    {state==='failed'&&<div className="playback-failure" role="alert"><h3>暂时无法播放</h3><p>已尝试可用入口。可能是视频失效、网络或编码不兼容。</p><div className="failure-actions"><button className="primary" onClick={()=>onRetry?onRetry():setRetry(v=>v+1)}><RefreshCw size={15}/>重新获取并播放</button>{onRestart&&position.current>3&&<button className="secondary" onClick={onRestart}>从头重试</button>}</div></div>}
  </>;
}
