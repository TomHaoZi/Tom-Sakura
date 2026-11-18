import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Copy } from 'lucide-react';
import MediaPlayer from './MediaPlayer';
import { candidateList } from './playback';

export default function EpisodePlayer({ item, episode, localSource, startAt, onProgress, onEnded, detailLoading, demo, rate, onRateChange, strategy, onStrategyChange }) {
  const local=useMemo(()=>candidateList(localSource),[localSource]);
  const [useRemote,setUseRemote]=useState(false),[remote,setRemote]=useState(null),[request,setRequest]=useState(0),[message,setMessage]=useState('');
  const position=useRef(startAt||0), failed=useRef(new Set()), refreshed=useRef(false), deadline=useRef(Date.now()+45000);
  const lastDiagnostic=useRef({});
  const needRemote=item.remote&&!demo&&(!local.length||useRemote);
  const report=time=>{position.current=time;onProgress?.(time);};
  useEffect(()=>{
    if(detailLoading||!needRemote)return;
    let canceled=false;setRemote(null);
    if(navigator.onLine===false|| (deadline.current!==null&&Date.now()>=deadline.current)){setRemote([]);return;}
    window.desktop.catalogResolve(item.id,episode,request>0)
      .then(result=>{
        if(canceled)return;
        const urls=candidateList(result.data).filter(url=>!failed.current.has(url)&&!local.includes(url));
        if(!urls.length&&!refreshed.current){refreshed.current=true;setRequest(v=>v+1);return;}
        setRemote(urls);
      }).catch(()=>{if(!canceled)setRemote([]);});
    return()=>{canceled=true;};
  },[item.id,episode,detailLoading,local,request,needRemote]);
  const reconnect=()=>{
    failed.current.clear();refreshed.current=false;deadline.current=Date.now()+45000;
    setRemote(null);setUseRemote(false);setRequest(v=>v+1);
  };
  const restart=()=>{position.current=0;onProgress?.(0);reconnect();};
  const exhausted=(time,{attempted=[],reason,diagnostic={}}={})=>{
    position.current=time;lastDiagnostic.current=diagnostic;
    for(const url of attempted)failed.current.add(url);
    if(!needRemote&&item.remote){setUseRemote(true);return;}
    if(needRemote&&!refreshed.current&&reason!=='budget'&& (deadline.current===null||Date.now()<deadline.current)){
      refreshed.current=true;setRemote(null);setRequest(v=>v+1);
    }
  };
  const diagnosticContext={title:item.title,episode};
  const copy=async()=>{
    try{const result=await window.desktop?.copyPlaybackDiagnostics({...lastDiagnostic.current,...diagnosticContext,phase:'unavailable',lastError:navigator.onLine===false?'offline':lastDiagnostic.current.lastError||'no-candidates',attempts:failed.current.size,position:Math.round(position.current),online:navigator.onLine});setMessage(result?.ok?'诊断已复制':'复制失败');}catch{setMessage('复制失败');}
  };
  if(detailLoading||(needRemote&&remote===null))return <div className="playback-status" role="status"><RefreshCw size={19}/><span>{request?'正在重新获取可用视频…':'正在准备视频…'}</span></div>;
  const candidates=needRemote?remote||[]:local;
  if(!candidates.length)return <div className="playback-failure" role="alert"><h3>{navigator.onLine===false?'当前网络已断开':'暂时无法播放'}</h3><p>本集暂不可用，请稍后重试。</p><div className="failure-actions"><button className="secondary" onClick={reconnect}><RefreshCw size={15}/>重新获取并播放</button>{position.current>3&&<button className="secondary" onClick={restart}>从头重试</button>}<button className="secondary" onClick={copy}><Copy size={14}/>{message||'复制诊断'}</button></div></div>;
  return <MediaPlayer key={`${needRemote}-${request}`} candidates={candidates} startAt={position.current} onProgress={demo?undefined:report} onEnded={onEnded} demo={demo} rate={rate} onRateChange={onRateChange} strategy={strategy} onStrategyChange={onStrategyChange} onRetry={item.remote?reconnect:undefined} onRestart={restart} onExhausted={exhausted} deadline={deadline} diagnosticContext={diagnosticContext} fresh={request>0}/>;
}
