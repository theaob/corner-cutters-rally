// Home's tiles, as Corner Cutters lays out its main menu: each rally a square button, an icon over its name, in a
// grid; SETTINGS smaller, in a row of its own set apart under them. The icons are line drawings on a 24 grid, in the
// text's colour (so a focused tile's cyan colours its icon too). Engine-free.

const SVG = 'http://www.w3.org/2000/svg';

export type TileIcon = 'GRAVEL' | 'SNOW' | 'SAND' | 'TARMAC' | 'settings';

const ICONS: Record<TileIcon, string> = {
  // two pines (the gravel rallies run through the forests)
  GRAVEL: '<path d="M8 3 3.5 11h3L3 16.5h10L9.5 11h3z"/><path d="M8 16.5V21"/><path d="M16.5 7.5 13.5 13h2.2l-2.7 4.5h7l-2.7-4.5H19.5z"/><path d="M16.5 17.5V21M2.5 21h19"/>',
  // a snowflake
  SNOW: '<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/><path d="M9.5 4 12 5.8 14.5 4M9.5 20 12 18.2 14.5 20M4 10.3l2.7-1.3-.2-3M20 13.7l-2.7 1.3.2 3M4 13.7l2.7 1.3-.2 3M20 10.3l-2.7-1.3.2-3"/>',
  // the sun over the dunes
  SAND: '<circle cx="16" cy="7" r="3"/><path d="M16 1.8v1M21.2 7h-1M19.7 3.3l-.7.7"/><path d="M2 17c3-4 6.5-4.5 9.5-1.2C14 13 18 12.5 22 15.5M2 21h20"/>',
  // a road into the distance, its centre line dashed
  TARMAC: '<path d="M4 21 10 3M20 21 14 3"/><path d="M12 20.5v-3M12 14v-2.5M12 8.5V7M12 5v-1" />',
  // sliders
  settings: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="#111118"/><circle cx="15.5" cy="12" r="2.2" fill="#111118"/><circle cx="8" cy="17" r="2.2" fill="#111118"/>',
};

/** A tile's icon as an <svg>, decorative (the tile's name is its label). */
export function tileIcon(icon: TileIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tile-icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[icon];
  return svg;
}

/** Makes `b` a tile: its icon over `name` (and `sub`, a quiet line under it, if any); `about` for a screen reader and a long press. */
export function makeTile(b: HTMLButtonElement, icon: TileIcon, name: string, about: string, sub?: HTMLElement): void {
  b.classList.add('menu-tile');
  b.title = about;
  b.setAttribute('aria-label', `${name}: ${about}`);
  const label = document.createElement('strong');
  label.textContent = name;
  b.replaceChildren(tileIcon(icon), label, ...(sub ? [sub] : []));
}

/** Tiles to a row (four rallies: two by two). */
export const TILE_COLUMNS = 2;

/**
 * Where up/down/left/right moves the highlight among `count` tiles in a grid of `cols` columns: left/right go to the
 * neighbour (wrapping at the ends), up/down a row. Off the top or the bottom row: -1 (out of the grid, to the place
 * before it or after it).
 */
export function gridStep(at: number, dx: number, dy: number, count: number, cols = TILE_COLUMNS): number {
  if (count <= 0) return -1;
  if (dx) return (at + dx + count) % count;
  if (!dy) return at;
  const to = at + dy * cols;
  if (to >= 0 && to < count) return to;
  // (down from a tile over a short last row's gap: that row's last tile)
  if (dy > 0 && Math.floor(at / cols) < Math.floor((count - 1) / cols)) return count - 1;
  return -1;
}
