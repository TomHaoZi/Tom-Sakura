const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseOneCatalog, parseOneDetail, parseOneSources, parseOnePagination, createOneCatalog, oneId } = require('../electron/one-catalog.cjs');
const listing = '<div><a href="/vod-play/20240001/ep2.html"><img src="/cover2/a.jpg" alt="测试番剧"></a><a href="/vod/20240001.html" title="测试番剧">测试番剧</a></div>';
const detail = '<h1 class="names">测试番剧</h1><div class="detail-left"><section><div class="detail-poster"><img src="/cover/a.jpg"></div>地区： 日本 年代： 2024</section><div class="small">真正的简介</div></div><div class="ep-panel"><a href="/vod-play/20240001/ep2.html">第02集</a><a href="/vod-play/20240001/ep1.html">第01集</a><a href="/vod-play/20240001/ep0.html">预告片</a><a href="/vod-play/20249999/ep1.html">第01集</a></div>';
test('primary catalog parses sibling covers without inventing scores or years', () => {
  const [item] = parseOneCatalog(listing);
  assert.equal(item.id,'one:20240001'); assert.equal(item.image,'https://yhdm.one/cover2/a.jpg'); assert.equal(item.score,null); assert.equal(item.year,'');
});
test('primary detail keeps identity and aligns explicit episode numbers', () => {
  const parsed = parseOneDetail(detail,'20240001');
  assert.equal(parsed.item.year,'2024'); assert.equal(parsed.item.type,'日韩动漫'); assert.deepEqual(parsed.item.episodeNumbers,[1,2]);
  assert.deepEqual(parsed.episodes,{'1':'ep1','2':'ep2'});
});
test('public JSON media extraction does not evaluate its embedded HTML', () => {
  const json = JSON.stringify({video_plays:[{play_data:'https://a.example/1.m3u8'},{play_data:'https://a.example/1.m3u8'},{play_data:'javascript:alert(1)'},{play_data:'file:///a.mp4'},{play_data:'http://127.0.0.1/a.mp4'}], html_content:'<script>throw 1</script>'});
  assert.deepEqual(parseOneSources(json),['https://a.example/1.m3u8']);
});
test('later fallback entrances are not silently discarded after the eighth address',()=>{
  const json=JSON.stringify({video_plays:Array.from({length:13},(_,i)=>({play_data:`https://cdn${i}.example/1.m3u8`}))});
  const values=parseOneSources(json);assert.equal(values.length,13);assert.ok(values.includes('https://cdn12.example/1.m3u8'));
});
test('primary cursors are opaque and scoped to query / category / year', async () => {
  const paths=[];
  const catalog=createOneCatalog(async url=>{paths.push(url);return new Response(listing+'<div class="pages">共10条数据 页次：1/2页<a href="/list/?country=jp&page=2">下一页</a></div>');});
  const first=await catalog.browse({category:'日韩动漫'});
  assert.ok(first.nextCursor.startsWith('one-')); assert.equal(first.total,10);
  await catalog.browse({category:'日韩动漫',cursor:first.nextCursor});
  assert.ok(paths[1].includes('page=2'));
  await assert.rejects(catalog.browse({category:'国产动漫',cursor:first.nextCursor}));
  assert.equal(parseOnePagination('<div class="pages"><a href="https://evil.example/list">下一页</a></div>').next,null);
});
test('source resolution uses the displayed episode mapping and fixed public endpoint', async () => {
  const paths=[];
  const catalog=createOneCatalog(async url=>{paths.push(url);return new Response(url.includes('/vod/')?detail:JSON.stringify({video_plays:[{play_data:'https://a.example/1.m3u8'}]}));});
  assert.deepEqual(await catalog.resolve('one:20240001',1),['https://a.example/1.m3u8']);
  assert.ok(paths[1].endsWith('/_get_plays/20240001/ep1'));
  await assert.rejects(catalog.resolve('one:20240001',0));
  for(const id of ['one:../private','one:2024?foo=1','https://evil.example/']) assert.throws(()=>oneId(id));
});
