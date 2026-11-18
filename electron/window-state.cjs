function normalizeWindowState(saved, areas) {
  const state = saved && typeof saved === 'object' ? saved : {};
  const usable = areas.filter(a => Number.isFinite(a.width) && a.width > 0 && Number.isFinite(a.height) && a.height > 0);
  const primary = usable[0] || { x: 0, y: 0, width: 1440, height: 940 };
  let area = primary;
  if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
    area = usable.find(a => state.x >= a.x && state.x < a.x + a.width && state.y >= a.y && state.y < a.y + a.height) || primary;
  }
  const minWidth = Math.min(1000, area.width), minHeight = Math.min(680, area.height);
  const width = Math.round(Math.max(minWidth, Math.min(area.width, Number.isFinite(state.width) ? state.width : 1440)));
  const height = Math.round(Math.max(minHeight, Math.min(area.height, Number.isFinite(state.height) ? state.height : 940)));
  const x = Math.round(Math.max(area.x, Math.min(area.x + area.width - width, Number.isFinite(state.x) ? state.x : area.x + (area.width - width) / 2)));
  const y = Math.round(Math.max(area.y, Math.min(area.y + area.height - height, Number.isFinite(state.y) ? state.y : area.y + (area.height - height) / 2)));
  return { x, y, width, height, minWidth, minHeight, maximized: state.maximized === true };
}
module.exports = { normalizeWindowState };
