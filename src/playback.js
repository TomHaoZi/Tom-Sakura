export const MAX_CANDIDATES = 16;
export function candidateList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const safe = [];
  for (const address of values) {
    if (typeof address !== 'string' || address.length > 8192) continue;
    try { const u = new URL(address); if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) safe.push(u.href); } catch {}
  }
  return [...new Set(safe)].slice(0, MAX_CANDIDATES);
}
// Session-only health: never persist signed addresses, hostnames, or tokens.
export class PlaybackHealth {
  constructor({ now = Date.now, cooldown = 120000 } = {}) { this.now = now; this.cooldown = cooldown; this.records = new Map(); this.hosts = new Map(); }
  entry(url) { const e = this.records.get(url); return e && this.now()-e.at <= this.cooldown ? e : null; }
  save(url, fields) {
    if (this.records.size >= 512 && !this.records.has(url)) this.records.delete(this.records.keys().next().value);
    this.records.set(url, { ...this.entry(url), ...fields, at: this.now() });
  }
  record(url, ok, reason = 'network') {
    this.save(url, { ok, reason });
    if (reason === 'manual') return;
    try {
      const host = new URL(url).origin;
      const old = this.hosts.get(host);
      const recent = old && this.now()-old.at <= this.cooldown ? old : { failed: new Set() };
      if (ok) { recent.ok = true; recent.slow = false; recent.failed.clear(); }
      else { if(recent.failed.size>=8)recent.failed.delete(recent.failed.values().next().value);recent.failed.add(url);recent.slow ||= ['repeated-stall','stall-timeout','connect-timeout'].includes(reason); if (recent.failed.size >= 2 || recent.slow) recent.ok = false; }
      recent.at = this.now();
      if (this.hosts.size >= 256 && !this.hosts.has(host)) this.hosts.delete(this.hosts.keys().next().value);
      this.hosts.set(host,recent);
    } catch {}
  }
  probe(url, result) { this.save(url, { ...(result.hard?{ok:false}:{}), probe: { ...result, at: this.now() } }); }
  probeResult(url) {
    const probe = this.entry(url)?.probe;
    return probe && this.now()-probe.at < 30000 ? probe : null;
  }
  rank(candidates) {
    const score = url => {
      const entry = this.entry(url);
      if (entry?.ok === false) return 8;
      if (entry?.ok === true) return 0;
      const probe = this.probeResult(url);
      if (probe?.ok) return 1 + Math.min(probe.ms || 0,5000)/10000;
      if (probe?.hard) return 9;
      if (probe && !probe.ok) return 7;
      const host = this.hosts.get(new URL(url).origin);
      if (host && this.now()-host.at <= this.cooldown) return host.ok ? 2 : host.slow || host.failed.size >= 2 ? 6 : 4;
      return 4;
    };
    return [...candidates].sort((a,b) => score(a)-score(b));
  }
}
export const playbackHealth = new PlaybackHealth();
export class PlaybackSession {
  constructor(candidates, health = null) {
    const values = candidateList(candidates);
    this.candidates = health ? health.rank(values) : values;
    this.index = 0;
  }
  get current() { return this.candidates[this.index] || null; }
  get remaining() { return this.candidates.slice(this.index); }
  prefer(url) { const index = this.candidates.indexOf(url,this.index); if(index > this.index) this.candidates.splice(this.index,0,this.candidates.splice(index,1)[0]); }
  fail() { if(this.index < this.candidates.length) this.index++; return this.current; }
}
export class PlaybackWatchdog {
  constructor(fail, { schedule = (...a) => setTimeout(...a), cancel = (...a) => clearTimeout(...a), connect = 10000, stall = 8000 } = {}) {
    Object.assign(this,{fail,schedule,cancel,connect,stall}); this.timer = null; this.version = 0; this.disposed = false;
  }
  clear() { this.version++; if(this.timer !== null) this.cancel(this.timer); this.timer = null; }
  arm(delay, replace = true) {
    if(this.disposed || (!replace && this.timer !== null)) return;
    this.clear(); const version = this.version;
    this.timer = this.schedule(() => { if(this.disposed || this.version !== version) return; this.timer = null; this.fail(); },delay);
  }
  connecting() { this.arm(this.connect); }
  waiting() { this.arm(this.stall,false); }
  seeking() { this.arm(this.stall); }
  progress() { this.arm(this.stall); }
  ready() { this.clear(); }
  pause() { this.clear(); }
  dispose() { this.disposed = true; this.clear(); }
}
// Short bursts count too: canplay/playing events alone cannot erase a bad source.
export class StallBudget {
  constructor({now = Date.now, windowMs = 30000, count = 3, totalMs = 3500} = {}) { Object.assign(this,{now,windowMs,count,totalMs}); this.reset(); }
  reset() { this.start = null; this.events = []; }
  begin() { if(this.start === null) this.start = this.now(); }
  end() {
    if(this.start !== null) { const ms = this.now()-this.start; if(ms >= 400) this.events.push({at:this.now(),ms}); this.start = null; }
    return this.exceeded();
  }
  pause() { this.end(); this.start = null; }
  exceeded() {
    const now = this.now(); this.events = this.events.filter(e => now-e.at <= this.windowMs);
    const current = this.start === null ? 0 : now-this.start;
    const count = this.events.length + (current >= 400 ? 1 : 0);
    return count >= this.count && this.events.reduce((sum,e) => sum+e.ms,0)+current >= this.totalMs;
  }
}
export function bufferedAhead(media) {
  try { for(let i=0;i<media.buffered.length;i++) if(media.currentTime >= media.buffered.start(i)-0.1 && media.currentTime <= media.buffered.end(i)) return Math.max(0,media.buffered.end(i)-media.currentTime); } catch {}
  return 0;
}
export function qualityCap(levels, strategy, urgent = false) {
  const max = urgent ? 480 : strategy === 'smooth' ? 720 : strategy === 'balanced' ? 1080 : Infinity;
  if(max===Infinity)return -1;
  let result = -1;
  levels.forEach((level,index) => { if(level.height>0&&level.height <= max) result = index; });
  return result; // -1: upstream only has a higher rendition; cannot manufacture one.
}
