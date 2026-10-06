// Pace notes: the co-driver's calls for a stage, read off the track itself.
// Every bend is a note: its direction and how tight it is, graded as rally
// crews grade them, 6 (barely a lift) down to 1 (the slowest), and HAIRPIN
// for the tightest that turn right round; LONG for a bend that goes on and
// on, TIGHTENS and OPENS for one that closes up or opens out toward its exit.
// A jump is a note of its own (OVER JUMP). Notes close together are linked
// (LEFT 4 INTO RIGHT 3), and a note before a long run to the next says how
// far it is (RIGHT 5 · 300). The co-driver calls each note far enough ahead
// to be ready for it: further ahead the faster you're going. Engine-free and
// unit-tested.

import type { Track } from './racing';

export const NOTES = {
  /** |curvature| (1/px) above which the road is bending: a corner is a run of samples above it */
  bend: 1 / 900,
  /** degrees a bend must turn through at least to be called (less is a kink, taken flat) */
  minTurn: 18,
  /** px of straighter road between two runs the same way that still makes them one bend */
  join: 24,
  /** within a bend, easing to this share of its sharpest so far, and bending again, makes it two bends */
  valley: 0.3,
  /** degrees turned through, at least, for a bend this tight (px of radius, or less) to be a hairpin */
  hairpin: { turn: 140, radius: 110 },
  /** px of arc, and degrees, for a bend to be LONG */
  long: { arc: 360, turn: 75 },
  /** × the sharpness from one half of a bend to the other for it to TIGHTEN (or OPEN, the other way) */
  tightens: 1.6,
  /** px or less from one note's end to the next one's start: the two are called as one (INTO) */
  link: 140,
  /** px or more to the next note: the distance is called, rounded to 50 */
  distance: 260,
  /** the tightest radius (px) through a bend, at least, for each grade (6 first; tighter than the last is a 1) */
  grades: [520, 320, 200, 130, 90] as const,
  /** the co-driver calls a note this many seconds ahead at your speed, but never less than `nearest` px */
  leadSeconds: 2.2,
  nearest: 170,
};

export type Grade = 1 | 2 | 3 | 4 | 5 | 6 | 'hairpin';
export type Modifier = 'LONG' | 'TIGHTENS' | 'OPENS';

export interface PaceNote {
  /** px along the stage where it begins, and ends */
  at: number;
  end: number;
  /** a bend: its direction and grade; a jump has neither */
  dir?: 'left' | 'right';
  grade?: Grade;
  jump?: boolean;
  /** a rally stage's flying finish */
  finish?: boolean;
  mods: Modifier[];
  /** called with the next one, as one (… INTO …) */
  into?: boolean;
  /** px on to the next note, when it's worth calling (rounded) */
  gap?: number;
}

const DEG = 180 / Math.PI;

/** The notes for `track` (one lap of it from the line; a rally's stage from its start to its finish), with jumps at `jumps` px along it. */
export function paceNotes(track: Track, jumps: number[] = []): PaceNote[] {
  const { samples, spacing, length } = track;
  const n = samples.length;
  // runs of bending road, each one way
  const runs: { from: number; to: number; sign: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = samples[i].curve;
    if (Math.abs(k) < NOTES.bend) continue;
    const sign = Math.sign(k);
    const last = runs[runs.length - 1];
    if (last && last.sign === sign && (i - last.to) * spacing <= NOTES.join) last.to = i;
    else runs.push({ from: i, to: i, sign });
  }
  // a run that eases nearly straight and bends again is two bends (one after the other, the same way)
  const bends: typeof runs = [];
  for (const r of runs) {
    let from = r.from;
    let peakSoFar = 0;
    let valley: number | undefined;
    for (let i = r.from; i <= r.to; i++) {
      const k = Math.abs(samples[i].curve);
      if (k < peakSoFar * NOTES.valley) valley ??= i;
      else if (valley !== undefined && k >= peakSoFar * NOTES.valley * 2) {
        bends.push({ from, to: valley, sign: r.sign });
        from = i;
        peakSoFar = 0;
        valley = undefined;
      }
      if (valley === undefined) peakSoFar = Math.max(peakSoFar, k);
    }
    bends.push({ from, to: r.to, sign: r.sign });
  }
  const notes: PaceNote[] = [];
  for (const r of bends) {
    let turn = 0;
    const peak = [0, 0];
    const mid = (r.from + r.to) / 2;
    for (let i = r.from; i <= r.to; i++) {
      const s = samples[i];
      turn += s.curve * spacing;
      const half = i <= mid ? 0 : 1;
      peak[half] = Math.max(peak[half], Math.abs(s.curve));
    }
    const degrees = Math.abs(turn) * DEG;
    if (degrees < NOTES.minTurn) continue;
    // (how far it turns through its tight part: a hairpin turns right round there)
    let core = 0;
    for (let i = r.from; i <= r.to; i++) if (Math.abs(samples[i].curve) >= Math.max(peak[0], peak[1]) * 0.4) core += Math.abs(samples[i].curve) * spacing;
    const radius = 1 / Math.max(peak[0], peak[1]);
    const k = NOTES.grades.findIndex((g) => radius >= g);
    let grade: Grade = (k < 0 ? 1 : 6 - k) as Grade;
    if (radius <= NOTES.hairpin.radius && core * DEG >= NOTES.hairpin.turn) grade = 'hairpin';
    const mods: Modifier[] = [];
    const arc = (r.to - r.from + 1) * spacing;
    if (arc >= NOTES.long.arc && degrees >= NOTES.long.turn) mods.push('LONG');
    if (grade !== 'hairpin' && peak[1] >= peak[0] * NOTES.tightens) mods.push('TIGHTENS');
    else if (grade !== 'hairpin' && peak[0] >= peak[1] * NOTES.tightens) mods.push('OPENS');
    notes.push({ at: r.from * spacing, end: r.to * spacing, dir: turn > 0 ? 'right' : 'left', grade, mods });
  }
  for (const at of jumps) notes.push({ at, end: at, jump: true, mods: [] });
  // a rally's stage: its bends from the start line to the flying finish, and the finish itself
  const stage = track.stage;
  if (stage) {
    for (let i = notes.length - 1; i >= 0; i--) if (notes[i].end < stage.start || notes[i].at > stage.finish) notes.splice(i, 1);
    notes.push({ at: stage.finish, end: stage.finish, finish: true, mods: [] });
  }
  notes.sort((a, b) => a.at - b.at);
  // links and distances, to the next note (the last: back round to the first, on a loop; on an open road, none)
  notes.forEach((note, i) => {
    const next = notes[i + 1] ?? (notes[0] && !track.open ? { at: notes[0].at + length } : undefined);
    if (!next || next === note) return;
    const gap = next.at - note.end;
    if (gap <= NOTES.link && i < notes.length - 1) note.into = true;
    else if (gap >= NOTES.distance) note.gap = Math.round(gap / 50) * 50;
  });
  return notes;
}

/** A note as the co-driver's card shows it: 'LEFT 4 LONG', 'HAIRPIN RIGHT', 'OVER JUMP'. */
export function noteText(note: PaceNote): string {
  if (note.jump) return 'OVER JUMP';
  if (note.finish) return 'FLYING FINISH';
  const dir = note.dir === 'left' ? 'LEFT' : 'RIGHT';
  const head = note.grade === 'hairpin' ? `HAIRPIN ${dir}` : `${dir} ${note.grade}`;
  return [head, ...note.mods].join(' ');
}

/** The words for a grade, as a co-driver says them. */
const SPOKEN: Record<string, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

/** A call as it's spoken: the notes in it, linked by 'into', and the distance after the last. */
export function spoken(notes: PaceNote[]): string {
  const said = notes.map((n) => noteText(n).toLowerCase().replace(/\b[1-6]\b/, (d) => SPOKEN[d]));
  const last = notes[notes.length - 1];
  return said.join(', into ') + (last?.gap ? `, ${last.gap}` : '');
}

/** A call as it's shown: 'LEFT 4 › RIGHT 3', with the distance after the last ('· 300'). */
export function shown(notes: PaceNote[]): string {
  const last = notes[notes.length - 1];
  return notes.map(noteText).join(' › ') + (last?.gap ? ` · ${last.gap}` : '');
}

/** The co-driver through a stage: the next note to call. */
export interface Caller {
  notes: PaceNote[];
  next: number;
}

export const newCaller = (notes: PaceNote[]): Caller => ({ notes, next: 0 });

/**
 * The call to make now, if one's due: you `s` px along the stage at `speed` px/s. A note is called once you're within
 * its lead of it (with the ones it runs INTO); a note you're already past is let go uncalled.
 */
export function stepCaller(c: Caller, s: number, speed: number): PaceNote[] | undefined {
  const lead = Math.max(NOTES.nearest, speed * NOTES.leadSeconds);
  // (gone by already: a restart or a spin, nothing to say about them now)
  while (c.next < c.notes.length && c.notes[c.next].end < s) c.next++;
  const first = c.notes[c.next];
  if (!first || first.at - s > lead) return undefined;
  const call = [first];
  while (call[call.length - 1].into && c.next + call.length < c.notes.length) call.push(c.notes[c.next + call.length]);
  c.next += call.length;
  return call;
}
