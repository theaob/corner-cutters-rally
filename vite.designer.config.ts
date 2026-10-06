// The track designer on its own (designer.html): `npm run designer` serves it, `npm run designer:build`
// builds it into dist-designer/, with the game beside it (its DRIVE IT button opens the game on the draft).
// Built, the designer is the folder's index.html and the game its play.html, so the folder can be hosted as it is
// (on GitHub Pages under designer/: .github/workflows/pages.yml); each page links to the other by its built name.
// The game's own build (index.html alone) never includes the designer.
import { defineConfig, type Plugin } from 'vite';

/** The built pages renamed: the designer the folder's index, the game play.html. */
const renamed: Plugin = {
  name: 'designer-pages',
  enforce: 'post',
  generateBundle(_, bundle) {
    const game = bundle['index.html'];
    const designer = bundle['designer.html'];
    if (game) game.fileName = 'play.html';
    if (designer) designer.fileName = 'index.html';
  },
};

export default defineConfig(({ command }) => ({
  base: './',
  // (the pages each links to: as built, or as served while working on it)
  define: {
    'import.meta.env.VITE_GAME_PAGE': JSON.stringify(command === 'build' ? 'play.html' : 'index.html'),
    'import.meta.env.VITE_DESIGNER_PAGE': JSON.stringify(command === 'build' ? 'index.html' : 'designer.html'),
  },
  plugins: [renamed],
  build: {
    outDir: 'dist-designer',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { designer: 'designer.html', game: 'index.html' } },
  },
}));
