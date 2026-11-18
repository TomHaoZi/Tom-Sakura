const { test } = require('node:test');
const assert = require('node:assert/strict');
test('a failed candidate advances once, never loops or duplicates', async () => {
  const { PlaybackSession } = await import('../src/playback.js');
  const session = new PlaybackSession(['https://a.example/1.mp4', 'https://a.example/1.mp4', 'https://b.example/1.m3u8']);
  assert.equal(session.current, 'https://a.example/1.mp4');
  assert.equal(session.fail(), 'https://b.example/1.m3u8');
  assert.equal(session.fail(), null);
  assert.equal(session.fail(), null);
});
test('candidate list is bounded and accepts legacy single URLs', async () => {
  const { candidateList } = await import('../src/playback.js');
  assert.deepEqual(candidateList('https://a.example/1.mp4'), ['https://a.example/1.mp4']);
  assert.deepEqual(candidateList(['file:///x', 'javascript:1', 'bad', 'https://u:p@example.com/x']), []);
  assert.equal(candidateList(Array.from({ length: 20 }, (_, i) => `https://a.example/${i}.mp4`)).length, 16);
});
