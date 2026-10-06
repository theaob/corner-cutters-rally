// The race's little pixel icons (the readout's lines, the results' summary and
// notes), each drawn on a 7 × 7 grid in the text's own colour, so they sit in a
// line of the pixel font like another letter.

/** Each icon's pixels: '#' filled, anything else empty, a row a string. */
const ART = {
  // a stopwatch: the crown, the round face and its hand
  watch: ['..###..', '...#...', '.#####.', '#..#..#', '#..##.#', '#.....#', '.#####.'],
  // a lap: round and back to the start
  lap: ['.####..', '#....#.', '#...###', '#....#.', '#......', '#.....#', '.#####.'],
  // your best: a star
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  // the record: a cup with its handles
  cup: ['#######', '#.###.#', '#.###.#', '.#####.', '...#...', '...#...', '.#####.'],
  // your car, from above: the wings, the wheels, the body
  car: ['.#####.', '##.#.##', '...#...', '..###..', '##.#.##', '##.#.##', '.#####.'],
  // a tyre: the ring and its hub
  tyre: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
  // the tow: the air streaming past
  tow: ['#####..', '.......', '..#####', '.......', '#####..', '.......', '..#####'],
  // track limits: a warning triangle
  warn: ['...#...', '..###..', '..#.#..', '.##.##.', '.#####.', '##.#.##', '#######'],
  // the ghost: your record lap's car
  ghost: ['.#####.', '#######', '#.#.#.#', '#######', '#######', '#######', '#.#.#.#'],
  // the pit crew's wrench
  wrench: ['.#..#..', '.#..#..', '.####..', '..##...', '..##...', '..##...', '..##...'],
  // a Time Attack's clock running out: an hourglass
  sand: ['#######', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#####.', '#######'],
  // how far you've got: a flag on its pole
  flag: ['#.#.#..', '##.#.#.', '#.#.#..', '##.#.#.', '#......', '#......', '#......'],
  // a medal on its ribbon
  medal: ['#.....#', '.#...#.', '..###..', '.#####.', '.##.##.', '.#####.', '..###..'],
} as const;

export type IconName = keyof typeof ART;

/** px of each of the icon's pixels at `size` px across */
const PIXELS = 7;

/** Icon `name` as an inline SVG `size` px square, in the text's colour (currentColor). */
export function iconSvg(name: IconName, size = 9): string {
  const rects: string[] = [];
  ART[name].forEach((row, y) => [...row].forEach((c, x) => c === '#' && rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PIXELS} ${PIXELS}" width="${size}" height="${size}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" style="display:block">${rects.join('')}</svg>`;
}

/** Icon `name` as an element (`size` px square), for putting in a line. */
export function icon(name: IconName, size = 9): HTMLElement {
  const span = document.createElement('span');
  span.innerHTML = iconSvg(name, size);
  Object.assign(span.style, { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: `${size}px`, height: `${size}px`, flex: 'none' });
  return span;
}

/** Every icon's pixels, for checking they're whole (7 × 7, each row its length). */
export const ICON_ART: Record<IconName, readonly string[]> = ART;
