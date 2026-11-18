// Injected by Vite from package.json, so the native and visible versions agree.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_SHORT_VERSION = APP_VERSION.split('.').slice(0, 2).join('.');
