const CODES = ['network','decode','manual','stall-timeout','connect-timeout','repeated-stall','budget','exhausted','unavailable','offline','no-candidates','decode-recovery'];
const number = value => Number.isFinite(value) ? Math.max(0,Math.min(1000000,Math.round(value))) : 0;
function buildPlaybackDiagnostic(input, version) {
  const data = input && typeof input==='object' ? input : {};
  const errors={};
  for(const code of CODES) if(data.errors?.[code]) errors[code]=number(data.errors[code]);
  const title=typeof data.title==='string'?data.title.slice(0,200).replace(/https?:\/\/\S+/gi,'[地址已隐藏]').replace(/[\r\n\t]/g,' '):'';
  return {
    application:'Tom Sakura',version,title,episode:number(data.episode),
    phase:['checking','connecting','recovering','buffering','paused','failed','ready','unavailable'].includes(data.phase)?data.phase:'unknown',
    engine:['hls-js','native-hls','native'].includes(data.engine)?data.engine:'unknown',
    strategy:['smooth','balanced','quality'].includes(data.strategy)?data.strategy:'unknown',
    online:typeof data.online==='boolean'?data.online:null,
    position:number(data.position),buffered:number(data.buffered),width:number(data.width),height:number(data.height),
    attempts:number(data.attempts),switches:number(data.switches),probes:number(data.probes),failedProbes:number(data.failedProbes),stalls:number(data.stalls),
    lastError:CODES.includes(data.lastError)?data.lastError:'unknown',errors,
    recentErrors:Array.isArray(data.recentErrors)?data.recentErrors.slice(-6).map(e=>({reason:CODES.includes(e?.reason)?e.reason:'unknown',time:number(e?.time),buffered:number(e?.buffered),readyState:number(e?.readyState),paused:e?.paused===true,seeking:e?.seeking===true,resumePending:e?.resumePending===true,hasPlayed:e?.hasPlayed===true,level:number(e?.level),startPosition:number(e?.startPosition),streamState:['IDLE','FRAG_LOADING','PARSING','PARSED','STOPPED','ENDED','ERROR','KEY_LOADING','WAITING_LEVEL','WAITING_INIT_PTS'].includes(e?.streamState)?e.streamState:'unknown',ranges:Array.isArray(e?.ranges)?e.ranges.slice(0,6).map(pair=>Array.isArray(pair)?pair.slice(0,2).map(number):[]):[]})):[],
  };
}
module.exports={buildPlaybackDiagnostic};
