// The play-stats dashboard on its own (stats.html): `npm run stats` serves it, `npm run stats:build` builds it into
// dist-stats/ (published to GitHub Pages by .github/workflows/pages.yml). It reads the game's Supabase project with
// the same public key the game uses (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). The game's build never includes it.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist-stats',
    rollupOptions: { input: { index: 'stats.html' } },
  },
});
