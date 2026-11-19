import { beforeEach, describe, expect, it } from 'vitest';
import { NORMAL } from '../src/f1/difficulty';
import { aiStage, crewScheme, newRally, nextStage, parseRally, rallyById, rallyOver, recordStage, type Rally } from '../src/f1/rally';
import { SCHEMES } from '../src/f1/crews';
import { ROUNDS, YOU, newSeason, recordRound, retireRound, seasonPlace, type Season } from '../src/f1/season';
import { SEASON_BONUS, champKey, loadCareer, owed, parseCareer, pay, payCareer, pickCar, toNextCar, yourCar } from '../src/f1/career';
import { CARS, carById } from '../src/f1/cars';
import { saved, useSave } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';

function drive(season: Season, event: string, yours: number, seed = 11): Rally {
  const r = newRally({ event: rallyById(event)!, seed, scheme: SCHEMES[0], difficulty: 'normal', season: { id: season.id, rivals: season.rivals } });
  while (!rallyOver(r)) recordStage(r, nextStage(r), { time: yours, health: 1 }, aiStage(r, nextStage(r), 30, NORMAL));
  return r;
}

beforeEach(() => useSave(CC_SAVE, undefined));

describe('career points', () => {
  it('pays each round driven once, your points from it', () => {
    const s = newSeason(5);
    expect(payCareer(s).points).toBe(0);
    recordRound(s, drive(s, ROUNDS[0].id, 20));
    const won = s.results[ROUNDS[0].id].points[YOU];
    expect(won).toBeGreaterThanOrEqual(25);
    expect(payCareer(s)).toEqual({ points: won, unlocked: CARS.filter((c) => c.unlock > 0 && c.unlock <= won) });
    expect(payCareer(s).points).toBe(0);
    expect(loadCareer().points).toBe(won);
    // (a round retired from pays nothing, and counts as paid)
    retireRound(s, newRally({ event: ROUNDS[1], seed: 3, scheme: SCHEMES[0], difficulty: 'normal', season: { id: s.id, rivals: s.rivals } }));
    expect(payCareer(s).points).toBe(0);
    expect(loadCareer().paid).toEqual({ [champKey(s)]: [ROUNDS[0].id, ROUNDS[1].id] });
  });

  it('pays a bonus by your place once the season is over, and starts a new tally for a new season', () => {
    const s = newSeason(5);
    for (const e of ROUNDS) recordRound(s, drive(s, e.id, 20));
    const c = parseCareer({ v: 2, points: 0, paid: {} })!;
    const o = owed(c, s);
    const rounds = ROUNDS.reduce((sum, e) => sum + (s.results[e.id].points[YOU] ?? 0), 0);
    expect(o.bonus).toBe(SEASON_BONUS[seasonPlace(s) - 1]);
    expect(pay(c, s)).toBe(rounds + o.bonus);
    expect(pay(c, s)).toBe(0);
    const next = newSeason(6);
    recordRound(next, drive(next, ROUNDS[0].id, 20));
    expect(pay(c, next)).toBe(next.results[ROUNDS[0].id].points[YOU]);
    expect(c.paid).toEqual({ [champKey(next)]: [ROUNDS[0].id] });
  });

  it('keeps only a good career', () => {
    expect(parseCareer({ v: 2, points: -3, paid: {} })).toBeUndefined();
    expect(parseCareer({ v: 2, points: 12, paid: { a: [4] } })).toBeUndefined();
    expect(parseCareer('x')).toBeUndefined();
    expect(parseCareer({ v: 2, points: 12.7, paid: { k: ['forests'] } })).toEqual({ v: 2, points: 12, paid: { k: ['forests'] } });
    // (one from before the classes: its season's tally is HISTORIC's championship's)
    expect(parseCareer({ v: 1, points: 30, paid: ['forests'], season: '2026-27:5' })).toEqual({ v: 2, points: 30, paid: { '2026-27:historic:5': ['forests'] } });
  });

  it('says how far it is to the next car', () => {
    expect(toNextCar(0)).toEqual({ car: carById('fulvia'), left: 20, share: 0 });
    expect(toNextCar(25)).toEqual({ car: carById('alpine'), left: 5, share: 0.5 });
    expect(toNextCar(10_000)).toBeUndefined();
  });
});

describe('career points from each class', () => {
  it("pays each class's championship apart, and a class's new one starts its own tally", () => {
    const h = newSeason(5, 'historic');
    const b = newSeason(6, 'groupb');
    for (const s of [h, b]) {
      const r = newRally({ event: ROUNDS[0], seed: 11, scheme: SCHEMES[0], difficulty: 'normal', season: { id: s.id, cls: s.cls, rivals: s.rivals } });
      while (!rallyOver(r)) recordStage(r, nextStage(r), { time: 20, health: 1 }, aiStage(r, nextStage(r), 30, NORMAL));
      recordRound(s, r);
    }
    const won = (s: Season) => s.results[ROUNDS[0].id].points[YOU];
    expect(payCareer(h, b).points).toBe(won(h) + won(b));
    expect(payCareer(h, b).points).toBe(0);
    const again = newSeason(9, 'historic');
    payCareer(again);
    expect(Object.keys(loadCareer().paid).sort()).toEqual([champKey(again), champKey(b)].sort());
  });
});

describe('your car', () => {
  it('is the first car until you pick another you have unlocked', () => {
    expect(yourCar(0).id).toBe('mini');
    expect(pickCar(carById('apex')!, 100)).toBe(false);
    expect(pickCar(carById('alpine')!, 100)).toBe(true);
    expect(saved('choices', 'car')).toBe('alpine');
    expect(yourCar(100).id).toBe('alpine');
    // (one no longer unlocked: the first car)
    expect(yourCar(0).id).toBe('mini');
  });

  it('drives a rally in it, in its own paint, and a rally from before the garage still loads', () => {
    const r = newRally({ event: rallyById('forests')!, seed: 2, scheme: SCHEMES[1], car: 'typhoon', difficulty: 'normal' });
    const back = parseRally(JSON.parse(JSON.stringify(r)))!;
    expect(back.crews[back.you].car).toBe('typhoon');
    expect(crewScheme(back.crews[back.you]).body).toBe(carById('typhoon')!.paint!.body);
    const old = newRally({ event: rallyById('forests')!, seed: 2, scheme: SCHEMES[1], difficulty: 'normal' });
    expect(crewScheme(parseRally(JSON.parse(JSON.stringify(old)))!.crews[old.you])).toEqual(SCHEMES[1]);
    expect(parseRally({ ...r, crews: r.crews.map((c, i) => (i === r.you ? { ...c, car: 'nope' } : c)) })).toBeUndefined();
  });
});
