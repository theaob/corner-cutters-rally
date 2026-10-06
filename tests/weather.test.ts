import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, aiPaceFor, handlingFor } from '../src/f1/difficulty';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, stepRace, type RaceEvent } from '../src/f1/raceControl';
import { stageById } from '../src/f1/stages';
import { COMPOUNDS, fitAt, tyreFor, tyreGrip, type Compound } from '../src/f1/tyres';
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

  /** One AI car down a tarmac stage in `weather`, to the flying finish: the events, and the car's grip against what its tyres should give each step. */
  const runStage = (id: string, weather: WeatherId | Forecast) => {
    const c = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const s = c.slots[0];
    const race = newRace(c.track, c.grid, handlingFor(NORMAL), 1, [{ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: 0, pace: aiPaceFor(NORMAL, 0, 1) } }], 0.5, weather);
    const start = race.entrants[0].tyres.compound;
    const at = () => race.entrants[0].progress.idx * race.track.spacing;
    const events: RaceEvent[] = [];
    let gripOff = 0;
    for (let t = 0; t < 200 && at() < race.track.stage!.finish; t += 1 / 60) {
      events.push(...stepRace(race, 1 / 60).race);
      const { car, tyres } = race.entrants[0];
      gripOff = Math.max(gripOff, Math.abs((car.tyreGrip ?? 1) - tyreGrip(tyres.wear) * fitAt(tyres.compound, race.wetness).grip));
    }
    return { race, start, events, gripOff, finished: at() >= race.track.stage!.finish };
  };

  // (one stage in each)
  it.each([
    { id: 'ss-castle-hill', weather: 'damp' as const, name: 'Castle Hill, damp' },
    { id: 'ss-coast-road', weather: 'wet' as const, name: 'Coast Road, wet' },
  ])('runs a clean stage at $name: the car on the right tyres for it all the way, to the finish', ({ id, weather }) => {
    const { race, start, events, finished } = runStage(id, weather);
    expect(start).toBe(tyreFor(weather));
    expect(race.weather).toBe(weather);
    expect(events.filter((e) => e.kind === 'wreck' || e.kind === 'crash' || e.kind === 'rain' || e.kind === 'track')).toEqual([]);
    expect(finished).toBe(true);
    expect(race.entrants[0].tyres.compound).toBe(tyreFor(weather));
  }, 60_000);

  // the weather changing through a stage: the road wetting or drying as forecast, the car's grip with it
  it.each([
    { name: 'rain setting in: on slicks, the road turning wet', forecast: { name: 'RAIN', start: 0, showers: [{ from: 10, to: Infinity, rain: 1 }] }, from: 'slick', rain: true, turns: 'wet' },
    { name: 'a wet start drying out: on full wets, the road drying to damp', forecast: { name: 'DRYING', start: 2, showers: [{ from: -Infinity, to: 10, rain: 1 }] }, from: 'wet', rain: false, turns: 'damp' },
  ] as { name: string; forecast: Forecast; from: Compound; rain: boolean; turns: WeatherId }[])(
    'runs a stage at Vineyards with $name, the car gripping as its tyres do on the road as it is',
    ({ forecast, from, rain, turns }) => {
      const { race, start, events, gripOff, finished } = runStage('ss-vineyards', forecast);
      expect(start).toBe(from);
      // (the rain came, or stopped, and the road turned)
      expect(events.filter((e) => e.kind === 'rain')).toEqual([{ kind: 'rain', on: rain }]);
      expect(events.some((e) => e.kind === 'track' && e.condition === turns)).toBe(true);
      expect(race.weather).toBe(turns);
      if (rain) expect(race.wetness).toBeCloseTo(2, 5);
      else expect(race.wetness).toBeLessThan(1.5);
      expect(events.filter((e) => e.kind === 'wreck')).toEqual([]);
      expect(finished).toBe(true);
      // (no stops on a stage: on the tyres it started on, gripping as they do on the road as it is now)
      expect(race.entrants[0].tyres.compound).toBe(from);
      expect(gripOff).toBeLessThan(1e-9);
    },
    60_000,
  );
});
