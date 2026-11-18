// Merge lightweight list cards without erasing detailed episode / synopsis data.
export function mergeLibrary(existing, incoming, { limit = 600, pinned = [] } = {}) {
  const map = new Map();
  for (const item of existing || []) {
    if (item && typeof item.id === 'string' && typeof item.title === 'string') map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string') continue;
    const previous = map.get(item.id);
    const next = { ...previous, ...item };
    if (previous) {
      for (const key of ['image', 'year', 'country', 'description', 'subtitle']) if (!item[key] && previous[key] !== undefined) next[key] = previous[key];
      if (previous.episodes && !item.episodes) { next.episodes = previous.episodes; next.episodeNumbers = previous.episodeNumbers; }
      if (item.type === '动漫' && previous.type) next.type = previous.type;
    }
    map.delete(item.id);
    map.set(item.id, next);
  }
  const values = [...map.values()];
  const pins = new Set(pinned);
  const saved = values.filter(item => pins.has(item.id));
  const rest = values.filter(item => !pins.has(item.id));
  const room = Math.max(0, limit - saved.length);
  return room ? [...saved, ...rest.slice(-room)] : saved;
}
