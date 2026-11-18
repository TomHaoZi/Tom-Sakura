export const APPEARANCE_KEY = 'ts-appearance';
export const DEFAULT_APPEARANCE = Object.freeze({ theme: 'light', reduceTransparency: false });
export function normalizeAppearance(value) {
  return {
    theme: ['light', 'dark', 'system'].includes(value?.theme) ? value.theme : 'light',
    reduceTransparency: value?.reduceTransparency === true,
  };
}
export function resolvedTheme(appearance, systemDark = false) {
  return appearance.theme === 'system' ? (systemDark ? 'dark' : 'light') : appearance.theme;
}
