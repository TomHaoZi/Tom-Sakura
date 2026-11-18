const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSources } = require('../electron/sources.cjs');
test('accepts indexed HTTP video sources', () => {
  assert.deepEqual(validateSources({ '1': { '1': 'https://example.com/video.mp4' } }), { '1': { '1': 'https://example.com/video.mp4' } });
});
test('rejects unsafe protocols, credentials and invalid episode keys', () => {
  for (const data of [null, [], { '1': [] }, { '1': { '1': 'file:///etc/passwd' } }, { '1': { '1': 'javascript:alert(1)' } }, { '1': { '1': 'https://user:pass@example.com/v.mp4' } }, { '1': { '0': 'https://example.com/v.mp4' } }, { '__proto__': 'x', 'a': {} }]) assert.throws(() => validateSources(data));
});
test('empty configuration is valid', () => assert.deepEqual(validateSources({}), {}));
test('supports deduplicated backup addresses per episode', () => {
  assert.deepEqual(validateSources({ '1': { '2': ['https://a.example/2.mp4', 'https://a.example/2.mp4', 'https://b.example/2.m3u8'] } }), { '1': { '2': ['https://a.example/2.mp4', 'https://b.example/2.m3u8'] } });
});
test('accepts remote catalog IDs without allowing path injection', () => {
  assert.deepEqual(validateSources({ 'sakura:example-show': { '1': 'https://a.example/1.mp4' } }), { 'sakura:example-show': { '1': 'https://a.example/1.mp4' } });
  assert.throws(() => validateSources({ 'sakura:../private': { '1': 'https://a.example/1.mp4' } }));
});
test('rejects empty, oversized and unsafe backup arrays', () => {
  for (const addresses of [[], Array(9).fill('https://example.com/a.mp4'), ['https://example.com/a.mp4', 'file:///x']]) {
    assert.throws(() => validateSources({ '1': { '1': addresses } }));
  }
});
