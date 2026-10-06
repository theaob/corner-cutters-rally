import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, aiPaceFor, handlingFor } from '../src/f1/difficulty';
import { ARDENNES, SILVER_HEATH } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, stepRace, type RaceEvent } from '../src/f1/raceControl';
import { COMPOUNDS, isDry, tyreFor, type Compound } from '../src/f1/tyres';
import { WEATHERS, type WeatherId } from '../src/f1/weather';
import type { Forecast } from '../src/f1/forecast';

const f1 = carClass('f1');
/** the tarmac's compounds (off-road tyres are for dirt alone: tyres.test.ts) */
const compounds = (Object.keys(COMPOUNDS) as Compound[]).filter((c) => c !== 'dirt');

describe('weather and tyres', () => {
  it.each(WEATHERS)('fit the quickest compound in the $name: slicks dry, intermediates damp, full wets wet', (w) => {
    const id = w.id as WeatherId;
    const best = tyreFor(id);
    expect(best).toBe({ dry: 'slick', damp: 'inter', wet: 'wet' }[id]);
    for (const c of compounds.filter((c) => c !== best)) {
      expect(COMPOUNDS[c].on[id].speed).toBeLessThan(COMPOUNDS[best].on[id].speed);
      expect(COMPOUNDS[c].on[id].grip).toBeLessThan(COMPOUNDS[best].on[id].grip);
    }
  });

  it('make a wet track slower than a dry one, even on the right tyres, and wear wet tyres out fast in the dry', () => {
    const on = (w: 'dry' | 'damp' | 'wet') => COMPOUNDS[tyreFor(w)].on[w];
    expect(on('damp').speed).toBeLessThan(on('dry').speed);
    expect(on('wet').speed).toBeLessThan(on('damp').speed);
    expect(COMPOUNDS.wet.on.dry.wear).toBeGreaterThan(3);
  });

  // (one race in each: the dry races in tyres.test.ts stop on every circuit)
  it.each([
    { layout: SILVER_HEATH, weather: 'damp' as const, name: 'Silver Heath, damp' },
    { layout: ARDENNES, weather: 'wet' as const, name: 'Ardennes, wet' },
  ])(
    'runs a clean 5-lap race at $name: everyone on the right tyres, one stop each (at most one, on a circuit easy on tyres), all finish',
    ({ layout, weather }) => {
      const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
      const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(NORMAL, i, 10) }, box: i >> 1 }));
      const race = newRace(c.track, c.grid, handlingFor(NORMAL), 5, field, 0.5, c.pit, weather);
      expect(race.entrants.every((e) => e.tyres.compound === tyreFor(weather))).toBe(true);
      const events: RaceEvent[] = [];
      for (let t = 0; t < 500 && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += 1 / 60) events.push(...stepRace(race, 1 / 60).race);
      expect(events.filter((e) => e.kind === 'wreck' || e.kind === 'safety-car')).toEqual([]);
      const stops = (layout.tyreWear ?? 1) < 1 ? (n: number) => n <= 1 : (n: number) => n === 1;
      expect(race.entrants.every((e) => e.progress.finished !== undefined && stops(e.stops) && e.tyres.compound === tyreFor(weather))).toBe(true);
    },
    60_000,
  );

  // the weather changing through a race: the crews box for the right tyres as it does
  it.each([
    { name: 'rain setting in: slicks (either), then full wets', forecast: { name: 'RAIN', start: 0, showers: [{ from: 25, to: Infinity, rain: 1 }] }, from: 'slick', to: 'wet', rain: true },
    { name: 'a wet start drying out: full wets, then slicks (either)', forecast: { name: 'DRYING', start: 2, showers: [{ from: -Infinity, to: 10, rain: 1 }] }, from: 'wet', to: 'slick', rain: false },
  ] as { name: string; forecast: Forecast; from: Compound; to: Compound; rain: boolean }[])(
    'runs a 6-lap race at Silver Heath with $name: everyone changes tyres in the pits, all finish',
    ({ forecast, from, to, rain }) => {
      const c = buildCircuit(SILVER_HEATH, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
      const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(NORMAL, i, 10) }, box: i >> 1 }));
      const race = newRace(c.track, c.grid, handlingFor(NORMAL), 6, field, 0.5, c.pit, forecast);
      // (in the dry, either slick: each car on its strategy's, strategy.ts)
      const on = (c: Compound, want: Compound) => (want === 'slick' ? isDry(c) : c === want);
      expect(race.entrants.every((e) => on(e.tyres.compound, from))).toBe(true);
      const events: RaceEvent[] = [];
      /** the race time each car first stopped */
      const firstStop = new Map<number, number>();
      for (let t = 0; t < 700 && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += 1 / 60) {
        const now = stepRace(race, 1 / 60).race;
        for (const e of now) if (e.kind === 'pit-stop' && !firstStop.has(e.who)) firstStop.set(e.who, race.clock);
        events.push(...now);
      }
      // (the rain came, or stopped, and the track turned)
      expect(events.some((e) => e.kind === 'rain' && e.on === rain)).toBe(true);
      expect(events.some((e) => e.kind === 'track' && e.condition === (rain ? 'wet' : 'dry'))).toBe(true);
      expect(race.weather).toBe(rain ? 'wet' : 'dry');
      expect(events.filter((e) => e.kind === 'wreck')).toEqual([]);
      expect(race.entrants.every((e) => e.progress.finished !== undefined && e.stops >= 1 && on(e.tyres.compound, to))).toBe(true);
      // (each crew calls it a little differently: not the whole field in on the same lap)
      const times = [...firstStop.values()];
      expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(5);
    },
    60_000,
  );
});
