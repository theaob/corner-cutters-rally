import { describe, expect, it } from 'vitest';
import { carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import type { Grid } from '../src/engine/sim';
import { DIFFICULTIES, NORMAL, aiPaceFor, difficultyById, handlingFor } from '../src/f1/difficulty';
import { RACE_HANDLING } from '../src/f1/racing';

const f1 = carClass('f1');
const [EASY, , HARD] = DIFFICULTIES;

/** Open ground with a wall along x = 400 (tiles 25+). */
const wall: Grid = { width: 50, height: 50, tile: 16, solid: Array.from({ length: 2500 }, (_, i) => i % 50 >= 25) };

/** Health a car has left after driving flat out into the wall at these rules. */
function crash(p: ReturnType<typeof handlingFor>): number {
  const car = newCar(f1, 200, 400, Math.PI / 2); // facing east, at the wall
  for (let t = 0; t < 1.5 && !car.wrecked; t += 1 / 60) stepCar(car, { steer: { x: 1, y: 0 }, handbrake: false }, p, 1 / 60, wall);
  return car.health;
}

describe('difficulties', () => {
  it('are easy, normal and hard, with normal as the game was', () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(['easy', 'normal', 'hard']);
    expect(difficultyById('hard')).toBe(HARD);
    expect(difficultyById('nope')).toBeUndefined();
    expect(handlingFor(NORMAL)).toEqual(RACE_HANDLING);
  });

  it('punish the same crash less on easy and more on hard', () => {
    const [easy, normal, hard] = DIFFICULTIES.map((d) => crash(handlingFor(d)));
    expect(easy).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(hard);
  });

  it('slow a damaged car less on easy and more on hard', () => {
    const topAtHalfHealth = (d: (typeof DIFFICULTIES)[0]) => {
      const car = newCar(f1, 100, 400, Math.PI / 2);
      car.health = f1.health / 2;
      const open: Grid = { width: 400, height: 50, tile: 16, solid: new Array(20000).fill(false) };
      for (let t = 0; t < 4; t += 1 / 60) stepCar(car, { steer: { x: 1, y: 0 }, handbrake: false }, handlingFor(d), 1 / 60, open);
      return speedOf(car);
    };
    expect(topAtHalfHealth(EASY)).toBeGreaterThan(topAtHalfHealth(NORMAL));
    expect(topAtHalfHealth(NORMAL)).toBeGreaterThan(topAtHalfHealth(HARD));
  });

  it('field a quicker, closer AI on hard and a slower, more spread one on easy', () => {
    const pace = (d: (typeof DIFFICULTIES)[0]) => [aiPaceFor(d, 1, 10), aiPaceFor(d, 9, 10)];
    const [easyFront, easyBack] = pace(EASY);
    const [normalFront, normalBack] = pace(NORMAL);
    const [hardFront, hardBack] = pace(HARD);
    expect(easyFront).toBeLessThan(normalFront);
    expect(normalFront).toBeLessThan(hardFront);
    expect(hardFront - hardBack).toBeLessThan(normalFront - normalBack);
    expect(normalFront - normalBack).toBeLessThan(easyFront - easyBack);
  });
});
