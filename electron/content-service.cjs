const { createOneCatalog } = require('./one-catalog.cjs');
const { createCatalog } = require('./catalog.cjs');

// Site identity stays part of the item ID. Never fuzzy-match titles / seasons or
// silently play a different edition just to obtain a working video.
function createContentService(fetcher) {
  const primary = createOneCatalog(fetcher);
  const secondary = createCatalog(fetcher);
  const adapter = id => {
    if (typeof id === 'string' && id.startsWith('one:')) return primary;
    if (typeof id === 'string' && id.startsWith('sakura:')) return secondary;
    throw new Error('无效的番剧');
  };
  return {
    async browse(options = {}) {
      if (options.cursor) return options.cursor.startsWith('one-') ? primary.browse(options) : secondary.browse(options);
      try { return await primary.browse(options); }
      catch { return secondary.browse(options); }
    },
    async list(query = '', category = '') { return (await this.browse({query,category})).items; },
    detail(id) { return adapter(id).detail(id); },
    resolve(id, episode, refresh = false) { return adapter(id).resolve(id,episode,refresh); },
  };
}
module.exports = { createContentService };
