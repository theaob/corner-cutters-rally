import { defineConfig } from 'vitest/config';
import { version } from './package.json';

/** The YouTube Playables SDK: loaded before the game's own code in the YouTube build (src/engine/host.ts). */
const YOUTUBE_SDK = 'https://www.youtube.com/game_api/v1';

export default defineConfig({
  base: './',
  // the YouTube build: Capacitor (the Android app's bridge and plugins) swapped for a stand-in (src/engine/notNative.ts)
  resolve: process.env.VITE_STORE === 'youtube'
    ? { alias: Object.fromEntries(['@capacitor/core', '@capacitor/app', '@capacitor/haptics', '@capacitor/share', '@capacitor/filesystem'].map((m) => [m, '/src/engine/notNative.ts'])) }
    : undefined,
  plugins: [
    {
      // the YouTube build (VITE_STORE=youtube): the SDK's script ahead of the game's module, as Playables asks
      name: 'youtube-sdk',
      transformIndexHtml: {
        order: 'post',
        handler: (html) => (process.env.VITE_STORE === 'youtube' ? html.replace('<script type="module"', `<script src="${YOUTUBE_SDK}"></script>\n    <script type="module"`) : html),
      },
    },
  ],
  // the build's version, for the play stats: the package's and the commit's (on CI)
  define: { __APP_VERSION__: JSON.stringify(`${version}+${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)}`) },
  build: {
    // three.js alone is ~560 kB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // (the tests never reach the real backend, whatever the environment's keys: CI's builds have them)
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
