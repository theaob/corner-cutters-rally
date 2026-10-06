import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { STAGE_SPECS, stageById } from '../src/f1/stages';
import { buildTrack, lineCornerSpeed, lineDecel, type Pt, type Track } from '../src/f1/racing';
import { NOTES, newCaller, noteText, paceNotes, shown, spoken, stepCaller, type PaceNote } from '../src/f1/paceNotes';

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
