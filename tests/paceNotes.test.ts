import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { STAGE_SPECS, stageById } from '../src/f1/stages';
import { buildTrack, lineCornerSpeed, lineDecel, type Pt, type Track } from '../src/f1/racing';
import { NOTES, cardArrow, newCaller, noteText, paceNotes, screenFacing, shown, spoken, stepCaller, type PaceNote } from '../src/f1/paceNotes';
import { arrowShape } from '../src/f1/race/rallyView';

const f1 = carClass('f1');
// (each stage's road built once)
const tracks = new Map<string, Track>();
const trackOf = (id: string) => {
  let t = tracks.get(id);
  if (!t) tracks.set(id, (t = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) }).track));
  return t;
};

/** A loop: a long straight, then a half circle of radius `r` round to the straight back, and another. */
function stadium(r: number, straight = 1600): Pt[] {
  const pts: Pt[] = [];
  for (let x = 0; x < straight; x += 100) pts.push({ x, y: 0 });
  for (let a = 0; a < 180; a += 15) pts.push({ x: straight + Math.sin((a * Math.PI) / 180) * r, y: r - Math.cos((a * Math.PI) / 180) * r });
  for (let x = straight; x > 0; x -= 100) pts.push({ x, y: 2 * r });
  for (let a = 0; a < 180; a += 15) pts.push({ x: -Math.sin((a * Math.PI) / 180) * r, y: r + Math.cos((a * Math.PI) / 180) * r });
  return pts;
}
const build = (pts: Pt[]) => buildTrack(pts, 8, lineCornerSpeed(f1), lineDecel(f1));

describe('pace notes', () => {
  it('call a slow half circle a hairpin, and a wide one a fast bend, each the way it turns', () => {
    const tight = paceNotes(build(stadium(70)));
    expect(tight).toHaveLength(2);
    expect(tight.every((n) => n.grade === 'hairpin' && n.dir === 'right')).toBe(true);
    const wide = paceNotes(build(stadium(700, 2400)));
    expect(wide.every((n) => typeof n.grade === 'number' && n.grade >= 5 && n.dir === 'right')).toBe(true);
    expect(wide.every((n) => n.mods.includes('LONG'))).toBe(true);
  });
  it('grade tighter bends lower', () => {
    const grade = (r: number) => paceNotes(build(stadium(r)))[0].grade;
    const order = [600, 300, 160, 100].map(grade);
    expect(order).toEqual([...order].sort((a, b) => Number(b) - Number(a)));
    expect(order[0]).not.toBe(order[3]);
  });
  it('call a jump where it is, and the distance on a long run to the next note', () => {
    const track = build(stadium(300, 3000));
    const notes = paceNotes(track, [1200]);
    const jump = notes.find((n) => n.jump)!;
    expect(noteText(jump)).toBe('OVER JUMP');
    expect(jump.gap).toBeGreaterThanOrEqual(NOTES.distance);
    expect(jump.gap! % 50).toBe(0);
  });
  it.each(STAGE_SPECS)('give the $name stage its bends from the start line on, ending with the flying finish', (spec) => {
    const track = trackOf(spec.id);
    const notes = paceNotes(track);
    // (a note every 800 px of road at least: twenty on a full stage, fewer on the short shakedown)
    expect(notes.length).toBeGreaterThanOrEqual(Math.floor(spec.length / 800));
    notes.forEach((n, i) => i && expect(n.at).toBeGreaterThanOrEqual(notes[i - 1].at));
    expect(notes[0].end).toBeGreaterThanOrEqual(track.stage!.start);
    const last = notes[notes.length - 1];
    expect(noteText(last)).toBe('FLYING FINISH');
    expect(last.at).toBe(track.stage!.finish);
    expect(last.gap).toBeUndefined();
  }, 30_000);
  it('find a hairpin on some stage', () => {
    expect(STAGE_SPECS.some((spec) => paceNotes(trackOf(spec.id)).some((n) => n.grade === 'hairpin'))).toBe(true);
  }, 60_000);
});

describe('the co-driver', () => {
  const notes: PaceNote[] = [
    { at: 500, end: 600, dir: 'left', grade: 4, mods: [], into: true },
    { at: 650, end: 700, dir: 'right', grade: 3, mods: ['TIGHTENS'], gap: 400 },
    { at: 1100, end: 1100, jump: true, mods: [] },
  ];
  it('calls a note once it is within the lead, with the one it runs into', () => {
    const c = newCaller(notes);
    expect(stepCaller(c, 0, 100)).toBeUndefined();
    const call = stepCaller(c, 400, 100)!;
    expect(shown(call)).toBe('LEFT 4 › RIGHT 3 TIGHTENS · 400');
    expect(spoken(call)).toBe('left four, into right three tightens, 400');
    expect(stepCaller(c, 410, 100)).toBeUndefined();
  });
  it('shows a long chain as how many bends and the tightest, so it fits a phone', () => {
    const call = notes.slice(0, 2);
    expect(shown(call, 2)).toBe('LEFT 4 › RIGHT 3 TIGHTENS · 400');
    expect(shown(call, 1)).toBe('2 BENDS · TIGHTEST 3');
    const chain: PaceNote[] = [
      { at: 0, end: 50, dir: 'right', grade: 5, mods: [], into: true },
      { at: 100, end: 150, dir: 'left', grade: 2, mods: [], into: true },
      { at: 200, end: 250, dir: 'right', grade: 4, mods: [], into: true },
      { at: 300, end: 350, dir: 'left', grade: 3, mods: [] },
    ];
    expect(shown(chain, 2)).toBe('4 BENDS · TIGHTEST 2');
    expect(shown([...chain.slice(0, 2), { at: 200, end: 200, jump: true, mods: [], into: true }, { at: 260, end: 300, dir: 'left', grade: 'hairpin', mods: [] }], 2))
      .toBe('3 BENDS · TIGHTEST HAIRPIN · JUMP');
    // (the voice still says every bend, left and right)
    expect(spoken(chain)).toBe('right five, into left two, into right four, into left three');
  });
  it('calls further ahead the faster you go', () => {
    expect(stepCaller(newCaller(notes), 1100 - 400, 300)?.[0].jump).toBe(undefined);
    const c = newCaller(notes.slice(2));
    expect(stepCaller(c, 1100 - 600, 100)).toBeUndefined();
    expect(stepCaller(c, 1100 - 600, 300)?.[0].jump).toBe(true);
  });
  it('lets go of notes already behind you', () => {
    const c = newCaller(notes);
    expect(stepCaller(c, 900, 100)?.[0].jump).toBe(true);
  });
});

/** An open road heading `deg` degrees (0 north, clockwise), then a bend of radius `r` turning `turn` degrees (right positive), then on. */
function bendRoad(deg: number, turn: number, r = 260): Track {
  const rad = (d: number) => (d * Math.PI) / 180;
  const pts: Pt[] = [];
  let x = 0;
  let y = 0;
  let h = rad(deg);
  const step = (len: number) => {
    x += Math.sin(h) * len;
    y -= Math.cos(h) * len;
    pts.push({ x, y });
  };
  pts.push({ x, y });
  for (let i = 0; i < 12; i++) step(100);
  const parts = Math.ceil(Math.abs(turn) / 5);
  for (let i = 0; i < parts; i++) {
    h += rad(turn / parts);
    step((rad(Math.abs(turn)) * r) / parts);
  }
  for (let i = 0; i < 12; i++) step(100);
  return buildTrack(pts, 8, lineCornerSpeed(f1), lineDecel(f1), true);
}

/** The difference between two angles in degrees, -180 to 180. */
const off = (a: number, b: number) => ((((a - b + 180) % 360) + 360) % 360) - 180;

describe("the card's arrow, on a north-up screen", () => {
  const headings = [0, 45, 90, 135, 180, 225, 270, 315];
  it.each(headings.flatMap((h) => [[h, 90], [h, -90]]))('heading %i°, a bend of %i°: points where the road goes on the screen', (h, turn) => {
    const track = bendRoad(h, turn);
    const bends = paceNotes(track).filter((n) => n.dir);
    expect(bends).toHaveLength(1);
    const note = bends[0];
    expect(note.dir).toBe(turn > 0 ? 'right' : 'left');
    const { rotate, sweep } = cardArrow(note, screenFacing('classic'));
    // (the arrow starts the way the road runs into the bend, and ends the way it runs out of it)
    expect(Math.abs(off(rotate, h))).toBeLessThan(10);
    const exit = (track.samples[Math.round(note.end / track.spacing) + 20].dir * 180) / Math.PI;
    expect(Math.abs(off(rotate + sweep, exit))).toBeLessThan(15);
    expect(Math.abs(off(rotate + sweep, h + turn))).toBeLessThan(15);
  });
  it('heading west, a left bend points down the screen (the road goes south)', () => {
    const note = paceNotes(bendRoad(270, -90)).find((n) => n.dir)!;
    const { rotate, sweep } = cardArrow(note, 0);
    expect(Math.abs(off(rotate + sweep, 180))).toBeLessThan(15);
  });
  it('points up the screen, from the driver\'s seat, in a view that turns with the car', () => {
    const note = paceNotes(bendRoad(270, -90)).find((n) => n.dir)!;
    for (const view of ['chase', 'top', 'road', 'heading', 'bonnet']) {
      expect(screenFacing(view)).toBeUndefined();
      expect(cardArrow(note, screenFacing(view)).rotate).toBe(0);
    }
    // (still sweeping the way it bends: left)
    expect(cardArrow(note, undefined).sweep).toBeLessThan(0);
  });
  it('sweeps a hairpin right round, and a fast kink a little', () => {
    expect(cardArrow({ at: 0, end: 0, dir: 'right', grade: 'hairpin', mods: [], heading: 0, turn: 2.6 }, 0).sweep).toBeGreaterThanOrEqual(160);
    expect(cardArrow({ at: 0, end: 0, dir: 'left', grade: 6, mods: [], heading: 0, turn: -0.35 }, 0).sweep).toBe(-30);
  });
  it.each([30, 90, 135, 180, -45, -90, -180])('draws its head along the arc at its end (%i°)', (sweep) => {
    const { line, head } = arrowShape(sweep);
    const end = line.split(' ').slice(-2).map(Number);
    const tip = head.split(' ')[0].split(',').map(Number);
    // (the way the head points, as a heading: 0 up, clockwise)
    const pointing = (Math.atan2(tip[0] - end[0], -(tip[1] - end[1])) * 180) / Math.PI;
    expect(Math.abs(off(pointing, sweep))).toBeLessThan(2);
    // (all of it inside the box, so it never clips however it's turned)
    for (const v of [...end, ...tip]) expect(Math.abs(v)).toBeLessThan(50);
  });
});
