import { defineConfig } from 'vitest/config';
import { version } from './package.json';

/** The YouTube Playables SDK: loaded before the game's own code in the YouTube build (src/engine/host.ts). */
const YOUTUBE_SDK = 'https://www.youtube.com/game_api/v1';

export default defineConfig({
  base: './',
  // the YouTube build: Capacitor (the Android app's bridge and plugins) swapped for a stand-in (src/engine/notNative.ts)
  resolve: process.env.VITE_STORE === 'youtube'
    ? { alias: Object.fromEntries(['@capacitor/core', '@capacitor/app', '@capacitor/haptics', '@capacitor/share', '@capacitor/filesystem', '@capacitor/local-notifications'].map((m) => [m, '/src/engine/notNative.ts'])) }
    : undefined,
  plugins: [
    {
      // a Content-Security-Policy on the built page (not the dev server's, which needs inline scripts): scripts only from
      // the page's own files, and connections only to them and the Supabase project (the build's, if it has one); the
      // YouTube build has its SDK's own hosts to reach, so it goes without
      name: 'csp',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html) => {
          if (process.env.VITE_STORE === 'youtube') return html;
          const supabase = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
          const policy = [
            "default-src 'self'",
            "script-src 'self'",
            // (the page sets styles inline: its elements', and html-to-image's for a share picture)
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' data: blob:",
            "font-src 'self' data:",
            `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'none'",
          ].join('; ');
          return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
        },
      },
    },
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
    // older Android WebViews (Chrome before 94) can't parse three.js's class static blocks ("Unexpected token '{'"
    // loading a race): those, and anything newer than Chrome 80 has, lowered
    target: ['es2020', 'chrome80', 'safari14'],
    // three.js alone is ~560 kB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
    // VITE_SOURCEMAPS=1 (the CI's separate build for the version's maps, tools/unminify.mjs): maps beside the code
    // without the comment that points a browser at them, so a player's build never carries or loads one
    sourcemap: process.env.VITE_SOURCEMAPS ? 'hidden' : false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // (the tests never reach the real backend, whatever the environment's keys: CI's builds have them)
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
