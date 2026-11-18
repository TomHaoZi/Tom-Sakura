const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCatalog, parseDetail, parseMedia, parsePagination, createCatalog, slugFromId } = require('../electron/catalog.cjs');
const listing = '<a href="/video-detail/test-show.html" class="pch-slide"><img src="https://img.example/cover.webp"><strong class="pch-title">测试番剧</strong><span class="pch-meta">2024 · 日本</span></a><a href="/video-detail/test-show.html"><img src="https://img.example/cover.webp" alt="测试番剧在线观看"></a>';
const detail = `<script type="application/ld+json">{"@type":"TVSeries","name":"测试番剧","genre":"日韩动漫","dateCreated":"2024"}</script>
<ul class="play-ji-ul"><li><a href="/video-play/test-show-1-1.html">第01集</a></li><li><a href="/video-play/test-show-1-2.html">第02集</a></li></ul>
<ul class="play-ji-ul"><li><a href="/video-play/test-show-2-1.html">预告片</a></li><li><a href="/video-play/test-show-2-2.html">第01集</a></li><li><a href="/video-play/unrelated-1-1.html">第01集</a></li></ul>`;
test('catalog parser deduplicates and never executes HTML scripts', () => {
  const items = parseCatalog(listing);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'sakura:test-show');
  assert.equal(items[0].score, null);
  assert.equal(items[0].year, '2024');
});
test('aligns candidates by displayed episode, excludes trailers and other shows', () => {
  const result = parseDetail(detail, 'test-show');
  assert.deepEqual(result.episodePaths[1], ['/video-play/test-show-1-1.html', '/video-play/test-show-2-2.html']);
  assert.equal(result.item.episodes, 2);
  assert.deepEqual(result.item.episodeNumbers, [1, 2]);
});
test('only explicit public media elements, no script / iframe evaluation', () => {
  assert.equal(parseMedia('<media-player src="https://cdn.example/1.m3u8?token=abc"></media-player>'), 'https://cdn.example/1.m3u8?token=abc');
  assert.equal(parseMedia('<script>player={url:"https://cdn.example/1.mp4"}</script>'), null);
  assert.equal(parseMedia('<iframe src="https://cdn.example/1.mp4"></iframe>'), null);
  assert.equal(parseMedia('<video src="file:///etc/passwd"></video>'), null);
  assert.equal(parseMedia('<video src="http://127.0.0.1/1.mp4"></video>'), null);
});
test('IDs cannot inject arbitrary request paths', () => {
  for (const id of ['https://evil.example/', 'sakura:../x', 'sakura:x?foo=1', 'sakura:']) assert.throws(() => slugFromId(id));
});
test('request cache deduplicates concurrent calls and candidate URLs', async () => {
  let calls = 0;
  const catalog = createCatalog(async url => {
    calls++;
    return new Response(url.includes('video-detail') ? detail : url.includes('video-play') ? '<video src="https://cdn.example/1.mp4"></video>' : listing);
  });
  const [a, b] = await Promise.all([catalog.list(), catalog.list()]);
  assert.equal(a[0].id, b[0].id);
  assert.equal(calls, 1);
  assert.deepEqual(await catalog.resolve('sakura:test-show', 1), ['https://cdn.example/1.mp4']);
  assert.equal(calls, 4);
});
test('movie-only labels are playable without mixing trailers into episodes', () => {
  const result = parseDetail('<h1 class="vod-h1">Movie</h1><ul class="play-ji-ul"><a href="/video-play/movie-1-1.html">正片</a></ul><ul class="play-ji-ul"><a href="/video-play/movie-2-1.html">预告片</a></ul>', 'movie');
  assert.deepEqual(result.item.episodeNumbers, [1]);
  assert.equal(result.episodePaths[1].length, 1);
});
test('pagination accepts only same-site catalog paths', () => {
  assert.equal(parsePagination('<div id="pages"><a class="layui-laypage-next" href="https://evil.example/x">next</a></div>').next, null);
  assert.equal(parsePagination('<div id="pages"><a class="layui-laypage-next" href="/video-type/fenlei2-2.html">下一页</a></div>').next, '/video-type/fenlei2-2.html');
});
test('browse uses opaque, filter-scoped cursors instead of arbitrary request URLs', async () => {
  const paths = [];
  const catalog = createCatalog(async url => { paths.push(url); return new Response(listing + '<div id="pages"><a class="layui-laypage-next" href="/video-type/fenlei2-2.html">下一页</a></div>'); });
  const first = await catalog.browse({category:'日韩动漫'});
  assert.ok(first.nextCursor);
  assert.equal(first.items[0].type,'日韩动漫');
  await catalog.browse({category:'日韩动漫',cursor:first.nextCursor});
  assert.ok(paths[1].endsWith('/video-type/fenlei2-2.html'));
  await assert.rejects(catalog.browse({category:'国产动漫',cursor:first.nextCursor}));
  await assert.rejects(catalog.browse({cursor:'https://evil.example/'}));
  await catalog.browse({category:'日韩动漫',year:'2024',sort:'time'});
  assert.ok(paths.at(-1).endsWith('/video-show/fenlei2--time---------2024.html'));
});
test('does not follow cross-origin redirects or bypass HTTP errors', async () => {
  const redirecting = createCatalog(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
  await assert.rejects(redirecting.list());
  const blocked = createCatalog(async () => new Response('', { status: 456 }));
  await assert.rejects(blocked.list());
});
