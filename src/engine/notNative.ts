// The YouTube Playables build's stand-in for Capacitor and its plugins (vite.config.ts points their imports here):
// that build never runs as the Android app, and Capacitor's own browser code reaches for what Playables rules out
// (the page's cookies, the page's visibility). Never native, so the plugins are never called; they're here only to
// be imported.

const never = () => Promise.resolve(undefined as never);

export const Capacitor = { isNativePlatform: (): boolean => false, getPlatform: (): string => 'web' };
export const App = { addListener: never, exitApp: never };
export const Haptics = { vibrate: never };
export const Share = { share: never };
export const Filesystem = { writeFile: never };
export const Directory = { Cache: 'CACHE' };
