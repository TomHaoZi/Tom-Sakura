import { useEffect, useLayoutEffect, useState } from 'react';
import { APPEARANCE_KEY, normalizeAppearance, resolvedTheme } from './appearance.js';

function useSystemPreference(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const changed = () => setMatches(media.matches);
    media.addEventListener('change', changed);
    changed();
    return () => media.removeEventListener('change', changed);
  }, [query]);
  return matches;
}
export function useAppearance(cinema = false) {
  const [appearance, setAppearance] = useState(() => {
    try { return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY))); }
    catch { return normalizeAppearance(null); }
  });
  const systemDark = useSystemPreference('(prefers-color-scheme: dark)');
  const systemReduced = useSystemPreference('(prefers-reduced-transparency: reduce)');
  const theme = resolvedTheme(appearance, systemDark);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.reducedTransparency = String(appearance.reduceTransparency || systemReduced);
    root.dataset.cinema = String(cinema);
    root.style.colorScheme = theme;
  }, [theme, appearance.reduceTransparency, systemReduced, cinema]);
  useEffect(() => { try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); } catch {} }, [appearance]);
  const updateAppearance = patch => setAppearance(old => normalizeAppearance({ ...old, ...patch }));
  return { appearance, updateAppearance, systemReduced, theme };
}
