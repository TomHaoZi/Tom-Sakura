const { test } = require('node:test');
const assert = require('node:assert/strict');
function clock() {
  let now = 0, id = 0;
  const jobs = new Map();
  return { schedule(fn, delay) { const key = ++id; jobs.set(key, { fn, at: now + delay }); return key; }, cancel(key) { jobs.delete(key); }, tick(ms) { const end = now + ms; for (let i = 0; i < 100; i++) { const next = [...jobs.entries()].sort((a,b) => a[1].at-b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; jobs.delete(next[0]); next[1].fn(); } now = end; } };
}
test('connection times out once at 10 seconds', async () => {
  const { PlaybackWatchdog } = await import('../src/playback.js');
  const time = clock(); let failures = 0;
  const dog = new PlaybackWatchdog(() => failures++, time);
  dog.connecting(); time.tick(9999); assert.equal(failures, 0);
  time.tick(1); assert.equal(failures, 1);
  time.tick(60000); assert.equal(failures, 1);
});
test('repeated buffering events do not postpone the 8 second deadline', async () => {
  const { PlaybackWatchdog } = await import('../src/playback.js');
  const time = clock(); let failures = 0;
  const dog = new PlaybackWatchdog(() => failures++, time);
  dog.waiting(); time.tick(5000); dog.waiting(); time.tick(3000);
  assert.equal(failures, 1);
});
test('pause cancels failure, seeking starts a new bounded deadline', async () => {
  const { PlaybackWatchdog } = await import('../src/playback.js');
  const time = clock(); let failures = 0;
  const dog = new PlaybackWatchdog(() => failures++, time);
  dog.waiting(); time.tick(4000); dog.pause(); time.tick(50000); assert.equal(failures, 0);
  dog.seeking(); time.tick(7999); assert.equal(failures, 0); time.tick(1); assert.equal(failures, 1);
});
test('old or disposed callbacks cannot affect another media attempt', async () => {
  const { PlaybackWatchdog } = await import('../src/playback.js');
  const jobs = []; let failures = 0;
  const dog = new PlaybackWatchdog(() => failures++, { schedule(fn) { jobs.push(fn); return jobs.length; }, cancel() {} });
  dog.connecting(); dog.ready(); jobs[0](); assert.equal(failures, 0);
  dog.waiting(); dog.dispose(); jobs[1](); assert.equal(failures, 0);
  dog.connecting(); assert.equal(jobs.length, 2);
});
test('healthy candidates precede recent failures without deleting fallback options', async () => {
  const { PlaybackHealth, PlaybackSession } = await import('../src/playback.js');
  let now = 0;
  const health = new PlaybackHealth({ now: () => now });
  const a = 'https://a.example/1.mp4', b = 'https://b.example/1.mp4';
  health.record(a, false); health.record(b, true);
  assert.equal(new PlaybackSession([a,b], health).current, b);
  assert.equal(new PlaybackSession([a,b], health).candidates.length, 2);
  now = 120001;
  assert.equal(new PlaybackSession([a,b], health).current, a);
});
