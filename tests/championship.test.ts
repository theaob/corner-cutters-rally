import { describe, expect, it } from 'vitest';
import { numberOf } from '../src/f1/drivers';
import { TEAMS } from '../src/f1/teams';
import { POINTS, newSeason, numberIn, parseSeason, pointsFor, pointsOf, recordRound, roundSeed, seasonOver, standings } from '../src/f1/championship';
import { GRAND_PRIX_LAPS, RACE_LAPS, seasonLength } from '../src/f1/laps';

const season = () => newSeason({ seed: 42, team: TEAMS[2], difficulty: 'normal', qualifying: false, rounds: ['crescent-park', 'silver-heath'], total: 10 });

describe('a championship season', () => {
  it('has the same field all season: you mid-field in your team, the rest two to a team, each with a pace rank', () => {
    const s = season();
    expect(s.drivers).toHaveLength(10);
    expect(s.drivers[s.you]).toMatchObject({ name: 'YOU', team: TEAMS[2].id });
    const perTeam = new Map<string, number>();
    for (const d of s.drivers) perTeam.set(d.team, (perTeam.get(d.team) ?? 0) + 1);
    expect([...perTeam.values()].every((c) => c === 2)).toBe(true);
    expect(s.drivers.map((d) => d.rank).sort((a, b) => a - b)).toEqual([...Array(10).keys()]);
    // (the same seed, the same field)
    expect(season()).toEqual(s);
    expect(roundSeed(s, 0)).not.toBe(roundSeed(s, 1));
  });
  it('puts you in the car you picked, your teammate in the other, all season', () => {
    const first = season();
    const mateOf = (s: typeof first) => s.drivers.find((d, k) => k !== s.you && d.team === TEAMS[2].id)!;
    expect(first.seat).toBe(0);
    expect(mateOf(first).name).toBe(TEAMS[2].drivers[1]);
    const second = newSeason({ seed: 42, team: TEAMS[2], seat: 1, difficulty: 'normal', qualifying: false, rounds: ['crescent-park'], total: 10 });
    expect(second.seat).toBe(1);
    expect(mateOf(second).name).toBe(TEAMS[2].drivers[0]);
    // (your number: your car's driver's; each other driver their own)
    expect(numberIn(first, first.you)).toBe(numberOf(TEAMS[2].drivers[0]));
    expect(numberIn(second, second.you)).toBe(numberOf(TEAMS[2].drivers[1]));
    second.drivers.forEach((d, k) => k !== second.you && expect(numberIn(second, k)).toBe(numberOf(d.name)));
    // (kept when saved and loaded; a season saved before the pick reads as the first car)
    expect(parseSeason(JSON.parse(JSON.stringify(second)))?.seat).toBe(1);
    const { seat: _, ...old } = first;
    expect(parseSeason(old)?.seat ?? 0).toBe(0);
  });
  it('scores F1 points for the top ten, none for a DNF', () => {
    expect(POINTS.reduce((a, b) => a + b)).toBe(101);
    expect(pointsFor(0)).toBe(25);
    expect(pointsFor(9)).toBe(1);
    expect(pointsFor(10)).toBe(0);
    expect(pointsFor(-1)).toBe(0);
  });
  it('records each round and ranks the drivers by points, then by their best results', () => {
    const s = season();
    const order = [...Array(10).keys()];
    // round 1: 0 wins, 1 is second; 9 is out
    recordRound(s, order, new Set([9]));
    expect(s.round).toBe(1);
    expect(s.places[0][9]).toBe(-1);
    // round 2: 1 wins, 0 is second: both on 43 points, with a win and a second each
    recordRound(s, [1, 0, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seasonOver(s)).toBe(true);
    const pts = pointsOf(s);
    expect(pts[0]).toBe(43);
    expect(pts[1]).toBe(43);
    const table = standings(s);
    // level on everything: in the order they were drawn
    expect(table.slice(0, 2).map((r) => r.driver)).toEqual([0, 1]);
    expect(table[0]).toMatchObject({ points: 43, wins: 1 });
    expect(table[table.length - 1].driver).toBe(9);
    // a season over takes no more rounds
    recordRound(s, order);
    expect(s.places).toHaveLength(2);
  });
  it('ranks by points over the season', () => {
    const s = season();
    recordRound(s, [2, 0, 1, 3, 4, 5, 6, 7, 8, 9]); // 2: 25, 0: 18, 1: 15, 3: 12
    recordRound(s, [0, 1, 3, 4, 5, 6, 7, 8, 9, 2]); // 0: 25, 1: 18, 3: 15, 2: 0 (10th: 0 points)
    // 1 has 33, 3 has 27, 2 has 25: order by points
    expect(standings(s).slice(0, 4).map((r) => r.driver)).toEqual([0, 1, 3, 2]);
  });
  it('breaks a tie on points with the better results (countback)', () => {
    const s = season();
    // 0 wins then retires (25); 2 is third then fifth (15 + 10 = 25): level on points, and 0's win puts it ahead
    recordRound(s, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    recordRound(s, [1, 3, 4, 5, 2, 6, 7, 8, 9, 0], new Set([0]));
    const pts = pointsOf(s);
    expect([pts[0], pts[2]]).toEqual([25, 25]);
    const table = standings(s).map((r) => r.driver);
    expect(table.indexOf(0)).toBeLessThan(table.indexOf(2));
  });
  it('survives the save; a damaged one is dropped', () => {
    const s = season();
    recordRound(s, [...Array(10).keys()]);
    expect(parseSeason(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSeason(null)).toBeUndefined();
    expect(parseSeason({ ...s, round: 2 })).toBeUndefined();
    expect(parseSeason({ ...s, places: [[0, 1]] })).toBeUndefined();
    expect(parseSeason({ ...s, difficulty: 'insane' })).toBeUndefined();
  });
});

describe("a season's length", () => {
  it('a SPRINT or a GRAND PRIX, kept with the season; one saved before there was a choice, or an odd one, a SPRINT', () => {
    const gp = newSeason({ seed: 7, team: TEAMS[0], difficulty: 'normal', qualifying: false, rounds: ['crescent-park'], total: 10, laps: GRAND_PRIX_LAPS });
    expect(parseSeason(JSON.parse(JSON.stringify(gp)))?.laps).toBe(GRAND_PRIX_LAPS);
    expect(seasonLength(parseSeason(JSON.parse(JSON.stringify(season())))?.laps).laps).toBe(RACE_LAPS);
    const odd = parseSeason({ ...JSON.parse(JSON.stringify(gp)), laps: 13 });
    expect(odd).toBeDefined();
    expect(seasonLength(odd?.laps)).toEqual({ laps: RACE_LAPS, name: 'SPRINT' });
    expect(seasonLength(GRAND_PRIX_LAPS).name).toBe('GRAND PRIX');
  });
});

describe("the Championship's circuits", () => {
  it('a round on every circuit but the free ones (Glacier Pass, Dust Bowl): those are open to everyone, and no round', async () => {
    const { CHAMPIONSHIP_LAYOUTS, FREE_LAYOUTS, LAYOUTS } = await import('../src/f1/layouts');
    expect(FREE_LAYOUTS.map((l) => l.id)).toEqual(['glacier-pass', 'dust-bowl']);
    expect(CHAMPIONSHIP_LAYOUTS.map((l) => l.id)).not.toContain('glacier-pass');
    expect(CHAMPIONSHIP_LAYOUTS.map((l) => l.id)).not.toContain('dust-bowl');
    expect(CHAMPIONSHIP_LAYOUTS.length + FREE_LAYOUTS.length).toBe(LAYOUTS.length);
    expect(CHAMPIONSHIP_LAYOUTS[0]).toBe(LAYOUTS[0]);
  });
});
