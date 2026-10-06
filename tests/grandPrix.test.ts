import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, order, stepRace } from '../src/f1/raceControl';
import { planText } from '../src/f1/strategy';

const f1 = carClass('f1');

/**
 * A 10-lap Grand Prix at `id` with ten AI cars all as quick as one another (so the strategy, and the place on the
 * grid, decide it): each car's strategy at the start, and the order they finish in.
 */
function grandPrix(id: string) {
  const layout = LAYOUTS.find((l) => l.id === id)!;
  const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const field = c.slots.slice(0, 10).map((s, i) => ({ car: newCar(f1, s.x, s.y, s.heading), ai: { lane: ((i * 7) % 11) - 5, pace: 0.95 }, box: i >> 1 }));
  const race = newRace(c.track, c.grid, handlingFor(NORMAL), 10, field, 0.5, c.pit);
  const plans = race.entrants.map((e) => planText(e.plan!.plan));
  for (let t = 0; t < 700 && !race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired); t += 1 / 60) stepRace(race, 1 / 60);
  return { race, plans, finish: order(race) };
}

describe('a Grand Prix (10 laps) with the field on its strategies', () => {
  const runs = ['crescent-park', 'royal-park', 'twin-lakes', 'oasis'].map(grandPrix);

  it('runs to the flag: every car finishes all 10 laps, and the field makes stops', () => {
    for (const { race } of runs) {
      expect(race.entrants.every((e) => e.progress.finished !== undefined && e.progress.lapTimes.length === 10)).toBe(true);
      expect(race.entrants.some((e) => e.stops > 0)).toBe(true);
    }
  });

  it('is balanced: no single strategy always wins, and each race has more than one strategy in the top five', () => {
    const winners = new Set(runs.map(({ plans, finish }) => plans[finish[0]]));
    expect(winners.size).toBeGreaterThan(1);
    for (const { plans, finish } of runs) expect(new Set(finish.slice(0, 5).map((k) => plans[k])).size).toBeGreaterThan(1);
  });
});
