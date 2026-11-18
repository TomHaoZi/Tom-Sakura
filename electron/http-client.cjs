// Fixed-origin, bounded, cached HTTP reads. No browser scripts or header spoofing.
function createHttpClient(origin, fetcher, allowPath) {
  const cache = new Map(), pending = new Map();
  return async function read(path, { ttl = 300000, refresh = false } = {}) {
    const target = new URL(path, origin);
    if (target.origin !== origin || !allowPath(target.pathname)) throw new Error('不支持的内容地址');
    const key = target.pathname + target.search;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now() && !refresh) return cached.text;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      let url = target;
      const signal = AbortSignal.timeout(12000);
      for (let n = 0; n <= 2; n++) {
        const response = await fetcher(url.href, { redirect: 'manual', signal, cache: refresh ? 'reload' : 'default' });
        if ([301,302,303,307,308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw new Error('内容暂不可用');
          url = new URL(location, url);
          if (url.origin !== origin || !allowPath(url.pathname)) throw new Error('站点跳转暂不支持');
          continue;
        }
        if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('站点暂不可用'); }
        const reader = response.body.getReader();
        const chunks = []; let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 2 * 1024 * 1024) throw new Error('页面超过读取限制');
            chunks.push(Buffer.from(value));
          }
        } finally { await reader.cancel().catch(() => {}); }
        const text = Buffer.concat(chunks).toString('utf8');
        if (cache.size >= 150) cache.delete(cache.keys().next().value);
        cache.set(key, { text, saved: Date.now(), expires: Date.now() + ttl });
        return text;
      }
      throw new Error('站点跳转次数过多');
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}
module.exports = { createHttpClient };
