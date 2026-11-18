const { app, net } = require('electron');
const { createContentService } = require('../electron/content-service.cjs');
app.whenReady().then(async () => {
  try {
    const catalog = createContentService((...args) => net.fetch(...args));
    const items = await catalog.list();
    console.log('LIVE_CATALOG', items.length);
    if (items[0]) {
      const detail = await catalog.detail(items[0].id);
      console.log('LIVE_EPISODES', detail.episodeNumbers.length);
      const urls = await catalog.resolve(items[0].id, detail.episodeNumbers[0]);
      console.log('LIVE_CANDIDATES', urls.length);
      await Promise.all(urls.map(async (url, index) => {
        try {
          const response = await net.fetch(url, { signal: AbortSignal.timeout(10000) });
          console.log('MEDIA_CHECK', index + 1, 'HTTP', response.status);
          await response.body?.cancel();
        } catch { console.log('MEDIA_CHECK', index + 1, 'network failure'); }
      }));
    }
    app.exit(0);
  } catch (error) { console.error('LIVE_ERROR', error.message); app.exit(1); }
});
