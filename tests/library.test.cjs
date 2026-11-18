const { test } = require('node:test');
const assert = require('node:assert/strict');
test('lightweight cards do not erase cached episode details', async () => {
  const { mergeLibrary } = await import('../src/library.js');
  const detailed = { id: 'sakura:a', title: 'A', episodes: 12, episodeNumbers: [1,2,3], year: '2024', type: '日韩动漫', description: 'Synopsis' };
  const [merged] = mergeLibrary([detailed], [{ id: 'sakura:a', title: 'A', episodes: 0, year: '', type: '动漫', description: '' }]);
  assert.equal(merged.episodes, 12); assert.equal(merged.description, 'Synopsis'); assert.equal(merged.type, '日韩动漫');
});
test('bounded cache preserves pinned favorites / history instead of dropping them', async () => {
  const { mergeLibrary } = await import('../src/library.js');
  const values = Array.from({length: 10}, (_, i) => ({id: `sakura:${i}`, title: String(i)}));
  const kept = mergeLibrary(values, [], { limit: 3, pinned: ['sakura:0'] });
  assert.deepEqual(kept.map(x => x.id), ['sakura:0','sakura:8','sakura:9']);
  assert.deepEqual(mergeLibrary(values, [], {limit: 0}), []);
});
test('deduplicates appended pages and ignores invalid cache entries', async () => {
  const { mergeLibrary } = await import('../src/library.js');
  assert.deepEqual(mergeLibrary([null, {id:'sakura:a',title:'Old'}], [{id:'sakura:a',title:'New'}]), [{id:'sakura:a',title:'New'}]);
});
