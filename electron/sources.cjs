const MAX_SIZE = 2 * 1024 * 1024;
function validateSources(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('片源文件必须是 JSON 对象');
  const result = {};
  for (const [id, episodes] of Object.entries(data)) {
    if (!/^(?:[1-9]\d{0,5}|sakura:[a-zA-Z0-9_-]{1,220}|one:\d{4,16})$/.test(id) || !episodes || typeof episodes !== 'object' || Array.isArray(episodes)) throw new Error('番剧 ID 或选集格式不正确');
    result[id] = {};
    for (const [episode, addresses] of Object.entries(episodes)) {
      if (!/^[1-9]\d{0,3}$/.test(episode)) throw new Error('集数格式不正确');
      const candidates = Array.isArray(addresses) ? addresses : [addresses];
      if (candidates.length === 0 || candidates.length > 8) throw new Error('每集需要 1–8 个备用地址');
      const urls = candidates.map(address => {
        if (typeof address !== 'string' || address.length > 8192) throw new Error('播放地址格式不正确');
        let url;
        try { url = new URL(address); } catch { throw new Error('无效的播放地址'); }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('只支持不含账号密码的 HTTP / HTTPS 视频地址');
        return url.href;
      });
      // 旧版单地址配置保持兼容；数组按优先级排列，重复地址不算备用源。
      result[id][episode] = Array.isArray(addresses) ? [...new Set(urls)] : urls[0];
    }
  }
  return result;
}
module.exports = { validateSources, MAX_SIZE };
