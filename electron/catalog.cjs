const cheerio = require('cheerio');
const { randomUUID } = require('node:crypto');
const ORIGIN = 'https://anime.donghua.hk';
const SLUG = /^[a-zA-Z0-9_-]{1,220}$/;
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
function externalUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) return '';
  try {
    const url = new URL(value, ORIGIN);
    const host = url.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.includes(':') || /^\d+(?:\.\d+){0,3}$/.test(host)) return '';
    return url.href;
  } catch { return ''; }
}
function slugFromId(id) {
  if (typeof id !== 'string' || !id.startsWith('sakura:') || !SLUG.test(id.slice(7))) throw new Error('无效的番剧');
  return id.slice(7);
}
function baseItem(slug, title, image, status, meta = '', description = '') {
  return { id: `sakura:${slug}`, title: clean(title), en: 'A NEW STORY AWAITS', image: externalUrl(image), status: clean(status) || '连载信息待确认', score: null, year: meta.match(/(?:19|20)\d{2}/)?.[0] || '', country: clean(meta.split('·')[1] || ''), type: '动漫', episodes: 0, subtitle: '下一段故事，与你相遇。', description: clean(description), color: '#889d97', remote: true };
}
function parseCatalog(html) {
  const $ = cheerio.load(html);
  const result = new Map();
  $('a[href^="/video-detail/"]').each((_, element) => {
    const a = $(element);
    const match = a.attr('href')?.match(/^\/video-detail\/([a-zA-Z0-9_-]+)\.html$/);
    if (!match || !SLUG.test(match[1])) return;
    const title = a.find('.pch-title,.videoul-title,.search-title').first().text() || a.attr('title') || a.find('img').first().attr('alt')?.replace(/在线观看.*$/, '');
    if (!title) return;
    const image = a.find('img').first();
    const item = baseItem(match[1], title, image.attr('lay-src') || image.attr('data-src') || image.attr('src'), a.find('.pch-tag,.videoul-tips1').first().text(), a.find('.pch-meta').text(), a.find('.pch-desc').text());
    const parentMeta = a.closest('li').find('.videoul-type,.videoul-text').text();
    if (!item.year) item.year = parentMeta.match(/(?:19|20)\d{2}/)?.[0] || '';
    if (!result.has(item.id)) result.set(item.id, item);
  });
  return [...result.values()].slice(0, 120);
}
function parseDetail(html, slug) {
  const $ = cheerio.load(html);
  let metadata = {};
  $('script[type="application/ld+json"]').each((_, element) => {
    try { const value = JSON.parse($(element).text()); if (['TVSeries', 'Movie'].includes(value['@type'])) metadata = value; } catch {}
  });
  const name = metadata.name || $('.vod-h1').clone().children().remove().end().text();
  if (!clean(name)) throw new Error('暂时无法读取番剧详情');
  const item = baseItem(slug, name, metadata.image || $('.vod-info-pic img').attr('lay-src'), $('.vod-info-right').find('p').first().text(), `${metadata.dateCreated || ''} · ${metadata.countryOfOrigin || ''}`, metadata.description || $('meta[property="og:description"]').attr('content'));
  item.type = clean(metadata.genre) || '动漫';
  const episodePaths = {};
  $('.play-ji-ul').each((_, group) => {
    const links = $(group).find('a[href^="/video-play/"]');
    links.each((_, element) => {
      const href = $(element).attr('href');
      const match = href?.match(/^\/video-play\/([a-zA-Z0-9_-]+)-(\d+)-(\d+)\.html$/);
      if (!match || match[1] !== slug) return;
      // Align by the displayed episode number, not a source's list position.
      const label = clean($(element).text());
      const labelMatch = label.match(/^(?:第|EP?\s*)?\s*(\d+)\s*[集话話期]?$/i);
      const movie = links.length === 1 && /^(?:正片|全集|完整版|HD|HD中字|高清|蓝光|1080P)$/i.test(label);
      if (!labelMatch && !movie) return; // Do not mix trailers / specials with numbered episodes.
      const number = movie ? 1 : Number(labelMatch[1]);
      if (number < 1 || number > 2000) return;
      const entry = episodePaths[number] ||= [];
      if (!entry.includes(href) && entry.length < 8) entry.push(href);
    });
  });
  item.episodes = Math.max(0, ...Object.keys(episodePaths).map(Number));
  item.status = item.episodes ? `${Object.keys(episodePaths).length} 集可选` : '暂无选集';
  item.episodeNumbers = Object.keys(episodePaths).map(Number).sort((a,b) => a-b);
  return { item, episodePaths };
}
function parseMedia(html) {
  const $ = cheerio.load(html);
  // Only explicit public media elements; never eval scripts or decode protected players.
  const address = $('media-player[src],video[src],video source[src]').first().attr('src');
  const url = externalUrl(address);
  return url && /\.(?:m3u8|mp4|webm)(?:$|[?#])/i.test(url) ? url : null;
}
function parsePagination(html) {
  const $ = cheerio.load(html);
  const current = Number(clean($('.layui-laypage-curr em').last().text())) || 1;
  const next = $('#pages a.layui-laypage-next:not(.layui-disabled), a[rel="next"]').first().attr('href');
  if (!next) return { current, next: null };
  try {
    const url = new URL(next, ORIGIN);
    if (url.origin !== ORIGIN || !/^\/video-(?:search|type|show)\/[a-zA-Z0-9_-]+\.html$/.test(url.pathname)) return { current, next: null };
    return { current, next: url.pathname + url.search };
  } catch { return { current, next: null }; }
}
function createCatalog(fetcher) {
  const cache = new Map();
  const details = new Map();
  const inFlight = new Map();
  const cursors = new Map();
  async function page(path, ttl = 300000, refresh = false) {
    if (!/^\/(?:$|video-(?:detail|play|search|type|show)\/)/.test(path)) throw new Error('不支持的请求');
    const original = new URL(path, ORIGIN);
    if (original.origin !== ORIGIN) throw new Error('无效的请求');
    const cached = cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.html;
    if (inFlight.has(path)) return inFlight.get(path);
    const work = (async () => {
      let url = original;
      for (let redirect = 0; redirect <= 2; redirect++) {
        const response = await fetcher(url.href, { redirect: 'manual', signal: AbortSignal.timeout(12000), cache: refresh ? 'reload' : 'default' });
        if ([301,302,303,307,308].includes(response.status)) {
          url = new URL(response.headers.get('location'), url);
          await response.body?.cancel();
          if (url.origin !== ORIGIN) throw new Error('站点跳转暂不支持');
          continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error('站点暂不可用'); }
        const reader = response.body.getReader();
        const chunks = [];
        let length = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 2 * 1024 * 1024) throw new Error('页面超出读取限制');
            chunks.push(Buffer.from(value));
          }
        } finally { await reader.cancel().catch(() => {}); }
        const html = Buffer.concat(chunks).toString('utf8');
        if (cache.size > 150) cache.delete(cache.keys().next().value);
        cache.set(path, { html, expires: Date.now() + ttl });
        return html;
      }
      throw new Error('站点暂不可用');
    })();
    inFlight.set(path, work);
    try { return await work; } finally { inFlight.delete(path); }
  }
  async function detail(id) {
    const slug = slugFromId(id);
    const parsed = parseDetail(await page(`/video-detail/${slug}.html`), slug);
    if (details.size > 100) details.delete(details.keys().next().value);
    details.set(id, parsed);
    return parsed;
  }
  return {
    async browse({ query = '', category = '', cursor = null, year = '', sort = '' } = {}) {
      const categories = { '国产动漫': '1', '日韩动漫': '2', '欧美动漫': '3', '海外动漫': '4' };
      if (typeof query !== 'string' || query.length > 100 || typeof category !== 'string') throw new Error('无效的搜索条件');
      if (year !== '' && !/^(?:19|20)\d{2}$/.test(year)) throw new Error('无效的年份');
      if (!['', 'time', 'hits', 'score'].includes(sort)) throw new Error('无效的排序');
      const key = JSON.stringify([query.trim(), category, year, sort]);
      const id = categories[category];
      let path = query.trim() ? `/video-search/-------------.html?wd=${encodeURIComponent(query.trim())}` : id ? (year || sort ? `/video-show/fenlei${id}--${sort}---------${year}.html` : `/video-type/fenlei${id}.html`) : '/';
      if (cursor !== null) {
        const stored = cursors.get(cursor);
        if (!stored || stored.key !== key || stored.expires < Date.now()) throw new Error('分页已过期，请刷新片单');
        path = stored.path;
      }
      const html = await page(path);
      const pagination = parsePagination(html);
      let nextCursor = null;
      if (pagination.next && pagination.next !== path) {
        if (cursors.size >= 200) cursors.delete(cursors.keys().next().value);
        nextCursor = randomUUID();
        cursors.set(nextCursor, { key, path: pagination.next, expires: Date.now() + 30 * 60000 });
      }
      return { items: parseCatalog(html).map(item => ({ ...item, type: id && !query.trim() ? category : item.type })), page: pagination.current, nextCursor };
    },
    async list(query = '', category = '') {
      if (typeof query !== 'string' || query.length > 100) throw new Error('关键词过长');
      const categories = { '国产动漫': '1', '日韩动漫': '2', '欧美动漫': '3', '海外动漫': '4' };
      const path = query.trim() ? `/video-search/-------------.html?wd=${encodeURIComponent(query.trim())}` : categories[category] ? `/video-type/fenlei${categories[category]}.html` : '/';
      return parseCatalog(await page(path));
    },
    async detail(id) { return (await detail(id)).item; },
    async resolve(id, episode, refresh = false) {
      if (!Number.isInteger(episode) || episode < 1 || episode > 2000) throw new Error('无效的集数');
      slugFromId(id);
      const data = details.get(id) || await detail(id);
      const paths = data.episodePaths[episode] || [];
      if (refresh === true) for (const path of paths) {
        const cached = cache.get(path);
        // A requested refresh must not return the just-failed signed URL from cache.
        if (cached) cache.delete(path);
      }
      // Read a bounded set in parallel. These are candidate entrances, not a guarantee
      // of independent CDNs or working media. Real playback determines availability.
      const results = await Promise.allSettled(paths.slice(0, 4).map(async path => parseMedia(await page(path, 60000, refresh === true))));
      return [...new Set(results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value))];
    },
  };
}
module.exports = { createCatalog, parseCatalog, parseDetail, parseMedia, parsePagination, externalUrl, slugFromId };
