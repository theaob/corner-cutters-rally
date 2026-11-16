import { beforeEach, describe, expect, it } from 'vitest';
import { NORMAL } from '../src/f1/difficulty';
import { aiStage, nextStage, rallyById, rallyOver, recordStage, newRally, parseRally, stageOrder, standings, type Rally } from '../src/f1/rally';
import { SCHEMES } from '../src/f1/crews';
import {
  ROUNDS, SEASON, YOU, currentSeason, loadSeason, newSeason, opensAt, parseSeason, recordRound, retireRound, roundOpen, roundResult, roundsToDrive,
  saveSeason, seasonOver, seasonPlace, seasonStandings, type Season,
} from '../src/f1/season';
import { useSave } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';

const DAY = 24 * 60 * 60 * 1000;

/** A round of `season` driven to its end, your time on every stage `yours` s (the rivals' off a 30 s reference run). */
function drive(season: Season, event: string, yours: number, seed = 11): Rally {
  const r = newRally({ event: rallyById(event)!, seed, scheme: SCHEMES[0], difficulty: 'normal', season: { id: season.id, rivals: season.rivals } });
  while (!rallyOver(r)) recordStage(r, nextStage(r), { time: yours, health: 1 }, aiStage(r, nextStage(r), 30, NORMAL));
  return r;
}

beforeEach(() => useSave(CC_SAVE, undefined));

describe('the season calendar', () => {
  it('runs the rallies as rounds, a new one opening each week from a Monday', () => {
    expect(ROUNDS.map((e) => e.id)).toEqual(SEASON.rounds);
    expect(new Date(SEASON.start).getUTCDay()).toBe(1);
    ROUNDS.forEach((_, k) => expect(opensAt(k) - SEASON.start).toBe(k * 7 * DAY));
  });

  it('opens a round on its day, and keeps it open after (a late player catches up on every round out)', () => {
    expect(roundOpen(0, SEASON.start - 1)).toBe(false);
    expect(roundOpen(0, SEASON.start)).toBe(true);
    expect(roundOpen(1, SEASON.start + 6 * DAY)).toBe(false);
    expect(roundOpen(1, SEASON.start + 7 * DAY)).toBe(true);
    const late = SEASON.start + 400 * DAY;
    ROUNDS.forEach((_, k) => expect(roundOpen(k, late)).toBe(true));
    expect(roundOpen(ROUNDS.length, late)).toBe(false);
    const s = newSeason(3);
    expect(roundsToDrive(s, SEASON.start + 8 * DAY).map((e) => e.id)).toEqual(SEASON.rounds.slice(0, 2));
  });
});

describe('a season', () => {
  it('has the same nine rival crews, at the same pace, in every round', () => {
    const s = newSeason(5);
    expect(s.rivals).toHaveLength(9);
    expect(new Set(s.rivals.map((c) => c.crew)).size).toBe(9);
    for (const e of ROUNDS) {
      const r = newRally({ event: e, seed: 99, scheme: SCHEMES[0], difficulty: 'normal', season: { id: s.id, rivals: s.rivals } });
      expect(r.season).toBe(s.id);
      expect(r.crews.filter((_, i) => i !== r.you)).toEqual(s.rivals);
    }
  });

  it('scores a round as the WRC does: 25 … 1 for the top ten overall, and 5 … 1 for the Power Stage’s five quickest', () => {
    const s = newSeason(5);
    const r = drive(s, 'forests', 25);
    const res = roundResult(r);
    const order = standings(r);
    const power = stageOrder(r, r.stages.length - 1).slice(0, 5);
    const key = (i: number) => (i === r.you ? YOU : r.crews[i].crew!);
    const total = Object.values(res.points).reduce((a, b) => a + b, 0);
    expect(total).toBe(SEASON.points.reduce((a, b) => a + b, 0) + SEASON.power.reduce((a, b) => a + b, 0));
    order.forEach((o, k) => expect(res.points[key(o.crew)]).toBe(SEASON.points[k] + (res.power[key(o.crew)] ?? 0)));
    power.forEach((o, k) => expect(res.power[key(o.crew)]).toBe(SEASON.power[k]));
    // (25 s a stage against a 30 s reference: you win the round, and the Power Stage)
    expect(res.place).toBe(1);
    expect(res.points[YOU]).toBe(30);
  });

  it('counts a round once, as it first finished, and only once it’s over', () => {
    const s = newSeason(5);
    const half = newRally({ event: rallyById('forests')!, seed: 1, scheme: SCHEMES[0], difficulty: 'normal', season: { id: s.id, rivals: s.rivals } });
    expect(recordRound(s, half)).toBe(false);
    expect(recordRound(s, drive(s, 'forests', 25))).toBe(true);
    expect(recordRound(s, drive(s, 'forests', 40))).toBe(false);
    expect(s.results.forests.place).toBe(1);
    // (a rally that isn't a round of this season doesn't count)
    const other = newRally({ event: rallyById('winter')!, seed: 1, scheme: SCHEMES[0], difficulty: 'normal' });
    while (!rallyOver(other)) recordStage(other, nextStage(other), { time: 20, health: 1 }, aiStage(other, nextStage(other), 30, NORMAL));
    expect(recordRound(s, other)).toBe(false);
  });

  it('adds the rounds up into standings, most points first; the title goes to the most after the last round', () => {
    const s = newSeason(8);
    for (const e of ROUNDS) recordRound(s, drive(s, e.id, 25));
    expect(seasonOver(s)).toBe(true);
    const table = seasonStandings(s);
    expect(table).toHaveLength(10);
    expect(table[0]).toMatchObject({ key: YOU, wins: ROUNDS.length, points: 30 * ROUNDS.length });
    for (let k = 1; k < table.length; k++) expect(table[k].points).toBeLessThanOrEqual(table[k - 1].points);
    expect(seasonPlace(s)).toBe(1);
  });

  it('is kept on the device, and a saved one from another season starts afresh', () => {
    useSave(CC_SAVE, undefined);
    const s = currentSeason(4);
    expect(loadSeason()).toEqual(s);
    recordRound(s, drive(s, 'forests', 25));
    saveSeason(s);
    expect(loadSeason()?.results.forests.place).toBe(1);
    expect(currentSeason(9).seed).toBe(4);
    expect(parseSeason({ ...s, id: 'old' })).toBeUndefined();
    expect(parseSeason({ ...s, results: { nowhere: s.results.forests } })).toBeUndefined();
    // (a round's rally keeps which season it's of)
    expect(parseRally(JSON.parse(JSON.stringify(drive(s, 'winter', 25))))?.season).toBe(s.id);
  });
});

describe('retiring from a round', () => {
  it('scores it 0 points for you, ends it for the season, and the rivals score as they stood (no Power Stage bonus)', () => {
    const s = newSeason(5);
    const r = drive(s, 'forests', 25);
    // (two stages run of four, then retired)
    const part = newRally({ event: rallyById('forests')!, seed: 11, scheme: SCHEMES[0], difficulty: 'normal', season: { id: s.id, rivals: s.rivals } });
    for (let k = 0; k < 2; k++) recordStage(part, k, { time: 25, health: 1 }, aiStage(part, k, 30, NORMAL));
    expect(retireRound(s, part)).toBe(true);
    const res = s.results.forests;
    expect(res.place).toBe(0);
    expect(res.points[YOU]).toBe(0);
    expect(res.power).toEqual({});
    const rivalsInOrder = standings(part).map((o) => o.crew).filter((i) => i !== part.you).map((i) => part.crews[i].crew!);
    rivalsInOrder.forEach((key, k) => expect(res.points[key]).toBe(SEASON.points[k]));
    // (over for the season: neither finishing it nor retiring again counts)
    expect(recordRound(s, r)).toBe(false);
    expect(retireRound(s, part)).toBe(false);
    expect(seasonStandings(s).find((c) => c.key === YOU)?.points).toBe(0);
    expect(parseSeason(JSON.parse(JSON.stringify(s)))?.results.forests.place).toBe(0);
  });

  it('before any stage, gives the rivals the points by their pace', () => {
    const s = newSeason(6);
    const r = newRally({ event: rallyById('winter')!, seed: 3, scheme: SCHEMES[0], difficulty: 'normal', season: { id: s.id, rivals: s.rivals } });
    expect(retireRound(s, r)).toBe(true);
    const quickest = s.rivals.find((c) => c.rank === 0)!.crew!;
    expect(s.results.winter.points[quickest]).toBe(SEASON.points[0]);
    expect(s.results.winter.points[YOU]).toBe(0);
  });
});
