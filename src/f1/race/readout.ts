// The readout's lines (the panel top left on a wide screen, down the left on a
// phone): the stage clock and your best time on the stage, your car's health
// and tyres as five blocks each (SIM); TOP-DOWN's is shorter, the stage clock, the
// gap at the last split and your car's health (no tyres: you never pick them); each line a row of an
// icon, its label and its value (readoutRows), the values lined up in a column
// of their own. Engine-free.

import { formatTime as fmt } from '../time';
import type { IconName } from './icons';
import { t } from '../../engine/i18n';

/** Five blocks, `share` (0…1) of them filled. */
export const blocks = (share: number) => {
  const n = Math.ceil(share * 5);
  return '■'.repeat(n) + '□'.repeat(5 - n);
};

/** The readout's main lines: the stage clock, your best on the stage, and your car. */
export function readoutText(r: {
  time?: number;
  best?: number;
  /** your car: its health's share, or wrecked */
  health: number;
  wrecked: boolean;
}): string {
  const car = r.wrecked ? t('WRECKED') : blocks(r.health);
  return `TIME ${fmt(r.time)}\nBEST ${fmt(r.best)}\nCAR  ${car}\n`;
}

/** The gap at a split as the readout says it: −0.42 ahead of the stage's quickest crew, +1.10 behind; none yet: –. */
export function gapValue(gap: number | undefined): string {
  if (gap === undefined) return '–';
  return `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(2)}`;
}

/** TOP-DOWN's readout: the stage clock, the gap at the last split (on a rally's stage), and your car's health as pips. */
export function topDownReadout(r: { time?: number; gap?: number; splits: boolean; health: number; wrecked: boolean }): string {
  const car = r.wrecked ? t('WRECKED') : blocks(r.health);
  return `TIME ${fmt(r.time)}\n${r.splits ? `GAP  ${gapValue(r.gap)}\n` : ''}CAR  ${car}\n`;
}

/** The tyre line: the compound, five blocks (and the share left, on the wide screen); past their best, WORN on a line of its own. */
export function tyreText(short: string, wear: number, showShare: boolean): string {
  const left = 1 - wear;
  return `TYRE ${short} ${blocks(left)}${showShare ? ` ${Math.round(left * 100)}%` : ''}\n${wear >= 0.7 ? 'WORN\n' : ''}`;
}

/** A line of the readout as its row: an icon, the label, the value; `span`: label and value as one, across both columns (a long label, on a narrow phone). */
export interface ReadoutRow {
  icon?: IconName;
  label: string;
  value: string;
  span?: boolean;
}

/** Each label's icon. */
export const LABEL_ICON: Record<string, IconName> = {
  TIME: 'watch', BEST: 'star', GAP: 'flag', CAR: 'car', TYRE: 'tyre',
};
/** labels longer than the label column has room for on a phone: label and value as one, across both columns */
const SPANS = new Set<string>();

/**
 * The readout's `text` (the lines above) as its rows: each line's first word its label (with its icon; ▲ and ▼, the
 * cars either side, are their own icons) and the rest its value; a line that's only a word (WORN) a value alone, under
 * the values above it.
 */
export function readoutRows(text: string): ReadoutRow[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [, label, value = ''] = l.match(/^(\S+)\s*(.*)$/) ?? [];
      if (!value && !LABEL_ICON[label]) return { label: '', value: t(label) };
      return { ...(LABEL_ICON[label] ? { icon: LABEL_ICON[label] } : {}), label: t(label), value, ...(SPANS.has(label) ? { span: true } : {}) };
    });
}
