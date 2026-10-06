import { describe, expect, it } from 'vitest';
import { BAKU, LAYOUTS, ROYAL_PARK, SUZUKA } from '../src/f1/layouts';
import { aiLap, blankDraft, check, circuitOf, constName, draftFrom, findCrossing, heightAt, layoutFrom, layoutToTs, setSetting, settingOf, shares, square } from '../src/designer/layoutEdit';
import { castleOf, landmarksOf } from '../src/f1/town3d';

describe('the track designer', () => {
  it('turns a layout into points with heights and back, each height where the profile had it', () => {
    for (const layout of LAYOUTS) {
      const draft = draftFrom(layout);
      expect(draft.points).toHaveLength(layout.points.length);
      const back = layoutFrom(draft);
      expect(back.points).toEqual(layout.points);
      expect(back.pit).toEqual(layout.pit);
      expect(back.elevation[0][0]).toBe(0);
      expect(back.elevation[back.elevation.length - 1]).toEqual([1, back.elevation[0][1]]);
      for (let i = 1; i < back.elevation.length; i++) expect(back.elevation[i][0]).toBeGreaterThanOrEqual(back.elevation[i - 1][0]);
      // the heights along the lap much as they were (the profile now pinned at the control points)
      const at = shares(layout.points);
      for (const [i, s] of at.entries()) expect(Math.abs(heightAt(back.elevation, s) - heightAt(layout.elevation, s))).toBeLessThan(0.11 + 0 * i);
      // and what's carried through (the banking, the podium deck, the forest, the tyre wear) stays as it was
      const { elevation: _a, ...rest } = back;
      const { elevation: _b, ...orig } = layout;
      expect(rest).toEqual(orig);
    }
  });

  it('writes a layout out as code for layouts.ts, that reads back as the same layout', () => {
    const ts = layoutToTs(layoutFrom(draftFrom(ROYAL_PARK)));
    expect(ts.startsWith('export const ROYAL_PARK: CircuitLayout = {')).toBe(true);
    // (evaluated as plain JavaScript, its type annotations taken out)
    const js = ts.replace('export const ROYAL_PARK: CircuitLayout =', 'return').replace(' as [number, number][]', '');
    const read = new Function(js)();
    expect(read.points).toEqual(ROYAL_PARK.points);
    expect(read.banking).toEqual(ROYAL_PARK.banking);
    expect(read.podiumDeck).toBe(ROYAL_PARK.podiumDeck);
    expect(constName('my new-track 2')).toBe('MY_NEW_TRACK_2');
  });

  it("passes the game's own circuits on every check", () => {
    for (const layout of LAYOUTS) {
      const failed = check(layout, circuitOf(layout)).filter((c) => !c.ok);
      expect(failed.map((c) => `${layout.id}: ${c.label} ${c.value}`)).toEqual([]);
    }
  }, 30_000);

  it('starts a new circuit from a blank that passes the checks, and an AI car laps it unhurt', () => {
    const layout = layoutFrom(blankDraft());
    const circuit = circuitOf(layout);
    expect(check(layout, circuit).filter((c) => !c.ok)).toEqual([]);
    const lap = aiLap(circuit);
    expect(lap.time).toBeGreaterThan(5);
    expect(lap.damage).toBe(0);
  });
});

describe('driving a draft from the designer', () => {
  it('reads the layout the designer left, under an id of its own (not a real circuit), or nothing if it is not one', async () => {
    const { DESIGNER_DRAFT_ID, parseDraft } = await import('../src/f1/designerDraft');
    const layout = layoutFrom(draftFrom(ROYAL_PARK));
    const back = parseDraft(JSON.stringify(layout))!;
    expect(back.id).toBe(DESIGNER_DRAFT_ID);
    expect(back.name).toBe('Royal Park (draft)');
    expect(back.points).toEqual(layout.points);
    expect(back.banking).toEqual(ROYAL_PARK.banking);
    // and it builds and races like any circuit
    expect(check(back, circuitOf(back)).filter((c) => !c.ok)).toEqual([]);
    for (const bad of [null, '', 'not json', '{}', JSON.stringify({ ...layout, points: [{ x: 1, y: 2 }] }), JSON.stringify({ ...layout, pit: undefined })]) expect(parseDraft(bad)).toBeUndefined();
  });
});

describe('designing a circuit like Caspian Shores or Nippon from scratch', () => {
  it('finds where a figure of eight crosses itself, where its bridge goes (as Nippon has it)', () => {
    const c = circuitOf(SUZUKA);
    const x = findCrossing(c)!;
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), c.track.length - Math.abs(a - b)) < 80;
    const { over, under } = SUZUKA.bridge!;
    expect((near(x.a, under) && near(x.b, over)) || (near(x.a, over) && near(x.b, under))).toBe(true);
    // (a lap that doesn't cross itself: none)
    expect(findCrossing(circuitOf(layoutFrom(blankDraft())))).toBeUndefined();
  });

  it("checks a bridge's two stretches are at the same height where they cross", () => {
    const ok = check(SUZUKA, circuitOf(SUZUKA)).find((k) => k.label === 'bridge')!;
    expect(ok.ok).toBe(true);
    const flat = { ...SUZUKA, elevation: [[0, 0], [0.5, 40], [1, 0]] as [number, number][] };
    expect(check(flat, circuitOf(flat)).find((k) => k.label === 'bridge')!.ok).toBe(false);
  });

  it('turns a blank into a street circuit with a sea, landmarks and old city walls, as Caspian Shores has, that the game builds', () => {
    const d = blankDraft();
    expect(settingOf(d)).toBe('park');
    setSetting(d, 'street');
    expect(settingOf(d)).toBe('street');
    const street = d.extras.street!;
    street.sea = square(700, 1300, 900);
    street.landmarks = { maiden: { x: 700, y: 350 }, tennis: { x: 700, y: -250 } };
    street.castle = { from: 0.3, to: 0.6, side: 1 };
    const layout = layoutFrom(d);
    const c = circuitOf(layout);
    expect(landmarksOf(c).map((l) => l.kind).sort()).toEqual(['maiden', 'tennis']);
    expect(castleOf(c).walls.length).toBeGreaterThan(0);
    // (written out as code with them all)
    const ts = layoutToTs(layout);
    expect(ts).toContain('"maiden"');
    expect(ts).toContain('"castle"');
    // back to parkland and the town's gone; a desert has its palms and camels (as Oasis)
    setSetting(d, 'desert');
    expect(d.extras.street).toBeUndefined();
    expect(d.extras.desert).toBe(true);
  });

  it('loads Caspian Shores as it is, its town and all, and writes it back the same', () => {
    const back = layoutFrom(draftFrom(BAKU));
    expect(back.street).toEqual(BAKU.street);
  });
});
