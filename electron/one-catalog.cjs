const cheerio = require('cheerio');
const { randomUUID } = require('node:crypto');
const { createHttpClient } = require('./http-client.cjs');
const { externalUrl } = require('./catalog.cjs');
const ORIGIN = 'https://yhdm.one';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
function oneId(value) {
  const match = typeof value === 'string' && value.match(/^one:(\d{4,16})$/);
  if (!match) throw new Error('无效的番剧');
  return match[1];
}
function imageUrl(value) { try { return value ? externalUrl(new URL(value, ORIGIN).href) : ''; } catch { return ''; } }
function makeItem(id, title, image = '', description = '') {
  return { id: `one:${id}`, remote: true, title: clean(title), en: 'A NEW STORY AWAITS', image: imageUrl(image), score: null, year: '', country: '', type: '动漫', episodes: 0, subtitle: '下一段故事，与你相遇。', description: clean(description).slice(0,12000), status: '点击查看选集', color: '#9d9c95' };
}
function parseOneCatalog(html) {
  const $ = cheerio.load(html);
  const items = new Map();
  $('a[href^="/vod/"]').each((_, element) => {
    const a = $(element), match = a.attr('href')?.match(/^\/vod\/(\d{4,16})\.html$/);
    if (!match) return;
    const context = a.closest('li').length ? a.closest('li') : a.parent();
    const image = a.find('img').first().length ? a.find('img').first() : context.find('img').first();
    const title = a.attr('title') || image.attr('alt') || clean(a.text());
    if (!title) return;
    const item = makeItem(match[1], title, image.attr('data-original') || image.attr('src'), context.find('p.ellipsis,.ellipsis2').first().text().replace(/^剧情简介[：:]?/, ''));
    item.status = clean(context.find('.ep-tip').first().text()) || item.status;
    item.year = clean(context.text()).match(/(?:Anime|年代[：:]|年份[：:])\s*((?:19|20)\d{2})/i)?.[1] || '';
    if (!items.has(item.id) || (!items.get(item.id).image && item.image)) items.set(item.id, item);
  });
  return [...items.values()].slice(0,120);
}
function parseOneDetail(html, id) {
  const $ = cheerio.load(html);
  const title = clean($('h1.names').text());
  if (!title) throw new Error('无法读取番剧详情');
  const item = makeItem(id, title, $('.detail-poster img').attr('src'), $('.detail-left > div.small').last().text());
  const metadata = clean($('.detail-left > section').first().text());
  item.year = metadata.match(/年代[：:]\s*((?:19|20)\d{2})/)?.[1] || '';
  item.country = metadata.match(/地区[：:]\s*([^\s]+)/)?.[1] || '';
  item.type = /中国|大陆/.test(item.country) ? '国产动漫' : /日本|韩国/.test(item.country) ? '日韩动漫' : /美国|英国|法国|加拿大/.test(item.country) ? '欧美动漫' : '海外动漫';
  item.status = clean($('.detail-left > section').first().find('.mb-1').last().text()) || item.status;
  const episodes = {};
  $('.ep-panel a[href^="/vod-play/"]').each((_, element) => {
    const a = $(element), match = a.attr('href')?.match(/^\/vod-play\/(\d{4,16})\/(ep\d{1,5})\.html$/);
    if (!match || match[1] !== id) return;
    const label = clean(a.text());
    const number = label.match(/^(?:第|EP?\s*)?\s*(\d+)\s*[集话話期]?$/i);
    const movie = /^(?:全集|正片|HD|高清|完整版)$/i.test(label);
    const value = movie ? 1 : number ? Number(number[1]) : 0;
    if (value > 0 && value <= 2000 && !episodes[value]) episodes[value] = match[2];
  });
  item.episodeNumbers = Object.keys(episodes).map(Number).sort((a,b) => a-b);
  item.episodes = Math.max(0,...item.episodeNumbers);
  return { item, episodes };
}
function parseOneSources(json) {
  const object = JSON.parse(json);
  if (!Array.isArray(object?.video_plays)) return [];
  const urls = object.video_plays.map(entry => externalUrl(entry?.play_data)).filter(url => url && /\.(?:m3u8|mp4|webm)(?:$|[?#])/i.test(url));
  return [...new Set(urls)].slice(0,16);
}
function parseOnePagination(html) {
  const $ = cheerio.load(html);
  const next = $('.pages a[href]').filter((_, element) => clean($(element).text()) === '下一页').first().attr('href');
  const text = clean($('.pages').text());
  let path = null;
  try { const url = new URL(next, ORIGIN); if (next && url.origin === ORIGIN && /^\/(?:list\/?|search\/?|)$/.test(url.pathname)) path = url.pathname + url.search; } catch {}
  return { next: path, current: Number(text.match(/页次[：:]\s*(\d+)/)?.[1]) || 1, total: Number(text.match(/共\s*(\d+)\s*条/)?.[1]) || null };
}
function createOneCatalog(fetcher) {
  const read = createHttpClient(ORIGIN, fetcher, path => /^\/(?:$|list\/?$|search\/?$|vod\/\d{4,16}\.html$|_get_plays\/\d{4,16}\/ep\d{1,5}$)/.test(path));
  const cursors = new Map();
  async function detail(id) { return parseOneDetail(await read(`/vod/${oneId(id)}.html`), oneId(id)); }
  return {
    async browse({query = '', category = '', year = '', cursor = null, index = false} = {}) {
      if (typeof query !== 'string' || query.length > 100 || typeof category !== 'string' || (year && !/^(?:19|20)\d{2}$/.test(year))) throw new Error('无效的筛选条件');
      const countries = {'国产动漫':'cn','日韩动漫':'jp','欧美动漫':'us','海外动漫':'other'};
      const params = new URLSearchParams();
      if (query.trim()) params.set('q',query.trim());
      else { if (countries[category]) params.set('country',countries[category]); if (year) params.set('year',year); }
      let path = query.trim() ? '/search?' + params : params.size || index ? '/list/?' + params : '/';
      const key = JSON.stringify([query.trim(),category,year,!!index]);
      if (cursor) {
        const stored = cursors.get(cursor);
        if (!stored || stored.key !== key || stored.expires < Date.now()) throw new Error('分页已过期');
        path = stored.path;
      }
      const html = await read(path);
      const pager = parseOnePagination(html);
      let nextCursor = null;
      if (pager.next && pager.next !== path) {
        if (cursors.size >= 200) cursors.delete(cursors.keys().next().value);
        nextCursor = 'one-' + randomUUID();
        cursors.set(nextCursor,{path:pager.next,key,expires:Date.now()+30*60000});
      }
      return { items: parseOneCatalog(html).map(item => ({...item,type:countries[category]&&!query.trim()?category:item.type,year:!query.trim()&&year?year:item.year})), page:pager.current, total:pager.total, nextCursor };
    },
    async detail(id) { return (await detail(id)).item; },
    async resolve(id, episode, refresh = false) {
      if (!Number.isInteger(episode) || episode < 1 || episode > 2000) throw new Error('无效的集数');
      const data = await detail(id);
      const key = data.episodes[episode];
      if (!key) return [];
      return parseOneSources(await read(`/_get_plays/${oneId(id)}/${key}`,{ttl:60000,refresh:refresh===true}));
    },
  };
}
module.exports = { createOneCatalog, parseOneCatalog, parseOneDetail, parseOneSources, parseOnePagination, oneId };
