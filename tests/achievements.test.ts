import { beforeEach, describe, expect, it } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { ACHIEVEMENTS, medalAchievements, raceAchievements, raced, torpedo, unlock, unlockedAchievements, type RaceSummary } from '../src/f1/achievements';
import { CC_SAVE } from '../src/f1/save';

const race = (o: Partial<RaceSummary>): RaceSummary => ({ place: 5, field: 10, grid: 6, fastest: false, damaged: true, strikes: 1, laps: 5, difficulty: 'normal', weather: 'dry', ...o });

beforeEach(() => {
  const items = new Map<string, string>();
  const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  useSave(CC_SAVE, store);
});

describe('achievements', () => {
  it('each have their own id, a name and what it takes', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.name.length && a.about.length).toBeTruthy();
  });

  it('for a race: finishing, a podium, a win, and the wins that ask more', () => {
    expect(raceAchievements(race({}))).toEqual(['finish']);
    expect(raceAchievements(race({ place: 3 }))).toContain('podium');
    expect(raceAchievements(race({ place: 1, grid: 2 }))).toEqual(expect.arrayContaining(['finish', 'podium', 'win']));
    expect(raceAchievements(race({ place: 1, difficulty: 'hard' }))).toContain('hard-win');
    expect(raceAchievements(race({ place: 1, weather: 'wet' }))).toContain('wet-win');
    expect(raceAchievements(race({ place: 1, grid: 6 }))).toContain('from-back');
    expect(raceAchievements(race({ place: 1, grid: 5 }))).not.toContain('from-back');
  });

  it('for a race: a charge through the field, a hat trick, a spotless race, a purple lap, a long one', () => {
    expect(raceAchievements(race({ grid: 9, place: 4 }))).toContain('charge');
    expect(raceAchievements(race({ grid: 8, place: 4 }))).not.toContain('charge');
    expect(raceAchievements(race({ place: 1, grid: 1, fastest: true }))).toContain('hat-trick');
    expect(raceAchievements(race({ place: 1, grid: 2, fastest: true }))).not.toContain('hat-trick');
    expect(raceAchievements(race({ damaged: false, strikes: 0 }))).toContain('spotless');
    expect(raceAchievements(race({ damaged: false, strikes: 1 }))).not.toContain('spotless');
    expect(raceAchievements(race({ fastest: true }))).toContain('purple');
    expect(raceAchievements(race({ laps: 15 }))).toContain('endurance');
  });

  it("for a race: CAN'T STOP WON'T STOP, the flag without a pit stop", () => {
    expect(raceAchievements(race({ stops: 0 }))).toContain('no-stop');
    expect(raceAchievements(race({ stops: 1 }))).not.toContain('no-stop');
    expect(raceAchievements(race({}))).not.toContain('no-stop');
  });

  it('TORPEDO: three cars or more hit off the start, at the Ardennes only', () => {
    expect(torpedo('ardennes', new Set([1, 2, 3]))).toBe(true);
    expect(torpedo('ardennes', new Set([1, 2]))).toBe(false);
    expect(torpedo('suzuka', new Set([1, 2, 3, 4]))).toBe(false);
    expect(ACHIEVEMENTS.find((x) => x.id === 'torpedo')?.name).toBe('TORPEDO');
    expect(ACHIEVEMENTS.find((x) => x.id === 'no-stop')?.name).toBe("CAN'T STOP WON'T STOP");
  });

  it('for a race: finishing on tyres worn to 0%, or with the car on fire', () => {
    expect(raceAchievements(race({ tyresLeft: 0 }))).toContain('bald');
    expect(raceAchievements(race({ tyresLeft: 1 }))).not.toContain('bald');
    expect(raceAchievements(race({}))).not.toContain('bald');
    expect(raceAchievements(race({ burning: true }))).toContain('torch');
    expect(raceAchievements(race({ burning: false }))).not.toContain('torch');
  });

  it('for the medals and titles in the cabinet', () => {
    expect(medalAchievements({ medals: { a: { attack: 'gold' }, b: { trial: 'silver' } }, titles: 0 }, ['a', 'b'])).toEqual(['golden']);
    expect(medalAchievements({ medals: { a: { trial: 'gold' }, b: { trial: 'gold' } }, titles: 1 }, ['a', 'b'])).toEqual(['golden', 'gold-standard', 'champion']);
  });

  it('unlock once, saved: the new ones are given back, the old ones not again', () => {
    expect(unlock(['win', 'finish']).map((a) => a.id)).toEqual(['finish', 'win']);
    expect(unlock(['win', 'podium']).map((a) => a.id)).toEqual(['podium']);
    expect(unlock(['nonsense'])).toEqual([]);
    expect(unlockedAchievements().sort()).toEqual(['finish', 'podium', 'win']);
  });

  it('know when you have raced on every circuit', () => {
    expect(raced('a', ['a', 'b'])).toBe(false);
    expect(raced('a', ['a', 'b'])).toBe(false);
    expect(raced('b', ['a', 'b'])).toBe(true);
  });
});
