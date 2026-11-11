// The interface's look in one place: its colours and its five sizes of type.
// Every screen (the menus, the stage's HUD, the results) takes its colours and
// type from here, so a change to the look is one edit. The page's CSS has the
// same colours as variables (index.html's :root: --gold, --text…), set from
// these at boot (applyTheme), so the stylesheet and the code can't drift apart.
// Scenery (the cars' paint, the ground, the trees) keeps its own colours.

/** The interface's colours. */
export const COLOR = {
  /** headings, your row, the co-driver's card */
  gold: '#f2c14e',
  /** a second accent: GO!, a rally's name over its standings */
  teal: '#5fe0d0',
  /** quiet text: labels, notes */
  muted: '#9d9ab8',
  /** bad news: out of the stage, wrong way, a crash */
  red: '#d8323c',
  /** a lighter red, for text on the dark panels */
  redText: '#ff6b6b',
  /** the main text */
  text: '#f4f2fa',
  /** the banner's plain messages */
  white: '#f4f4f8',
  /** the dark under pixel text: its drop shadow */
  ink: '#1b1b26',
  /** a button's face, and its edge */
  key: '#25233a',
  keyEdge: '#3a3858',
  /** the menus' third accent (a picked row) */
  pink: '#ff4fd8',
  /** the weather's messages */
  sky: '#8fb8e8',
  /** the HUD's panels: the readout, the card, the results */
  panel: 'rgba(21,20,31,.82)',
  /** the pause screen's dimming */
  dim: 'rgba(14,13,22,.72)',
} as const;

/** The CSS variables index.html's stylesheet uses, by name, and the colour each is. */
export const CSS_VARS: Record<string, string> = {
  '--gold': COLOR.gold,
  '--text': COLOR.text,
  '--muted': COLOR.muted,
  '--accent-a': COLOR.pink,
  '--accent-b': COLOR.teal,
  '--key': COLOR.key,
  '--key-edge': COLOR.keyEdge,
  '--key-held': COLOR.keyEdge,
  '--red': COLOR.red,
};

/** The five sizes of type (px, before TEXT: LARGE scales them): small print, labels, body, headings, titles. */
export const TYPE = { xs: 9, sm: 11, md: 12, lg: 16, xl: 22 } as const;
export type TypeStep = keyof typeof TYPE;

/** Two sizes off the scale, for the few things that are pictures more than text: the card's grade, the countdown. */
export const DISPLAY = { call: 36, countdown: 64 } as const;

/** The pixel font at `px`, scaled with TEXT (--ts) unless `fixed`. */
export function pixelFont(px: number, fixed = false): string {
  return `${fixed ? `${px}px` : `calc(${px}px * var(--ts, 1))`} Silkscreen, monospace`;
}
/** The pixel font at a step of the scale. */
export const font = (step: TypeStep, fixed = false) => pixelFont(TYPE[step], fixed);

/** Put the theme's colours on the page's root as CSS variables (index.html's stylesheet reads them). */
export function applyTheme(root: HTMLElement | undefined = globalThis.document?.documentElement): void {
  if (!root) return;
  for (const [name, value] of Object.entries(CSS_VARS)) root.style.setProperty(name, value);
}
