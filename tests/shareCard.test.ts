import { describe, expect, it } from 'vitest';
import { attackCard, cardFile, raceCard, seasonCard, shareText, splitDistance } from '../src/f1/shareCard';
import { seasonShareCard } from '../src/f1/screens/championship';
import { newSeason, recordRound } from '../src/f1/championship';
import { TEAMS } from '../src/f1/teams';

const team = { name: 'Milk Energy', body: '#1e2b5c', trim: '#f2c14e' };

describe('the result card to share', () => {
  it('a win: P1 in gold, WINNER, the places gained from the grid', () => {
    const c = raceCard({ circuit: 'CRESCENT PARK', mode: 'QUICK RACE · NORMAL · DRY', place: 1, field: 10, grid: 6, gap: 0, best: '0:29.81', fastest: true, team, date: '2026-10-04' });
    expect(c.headline).toBe('P1');
    expect(c.color).toBe('#f2c14e');
    expect(c.sub).toBe('WINNER');
    expect(c.stats).toEqual([['GRID', 'P6'], ['PLACES', '▲5'], ['FASTEST LAP', '0:29.81']]);
    expect(shareText(c)).toBe('I finished P1 at Crescent Park in Corner Cutters 🏁 🏆 Can you beat it? https://theaob.itch.io/corner-cutters');
    expect(cardFile(c)).toBe('corner-cutters-crescent-park-2026-10-04.png');
  });

  it('a podium, a lower place, and a DNF', () => {
    const base = { circuit: 'NIPPON', mode: 'QUICK RACE', field: 10, grid: 2, fastest: false, team, date: '2026-10-04' };
    expect(raceCard({ ...base, place: 3, gap: 4.2 }).sub).toBe('PODIUM · +4.20 S');
    const p7 = raceCard({ ...base, place: 7, gap: 21.456 });
    expect(p7.sub).toBe('+21.46 S');
    expect(p7.stats[1]).toEqual(['PLACES', '▼5']);
    const out = raceCard({ ...base });
    expect(out.headline).toBe('DNF');
    expect(shareText(out)).toMatch(/^I crashed out at Nippon/);
  });

  it("a Time Attack's distance and medal", () => {
    const c = attackCard({ circuit: 'OASIS', mode: 'TIME ATTACK', distance: '2 LAPS + 3 SECTORS', medal: 'gold', record: true, team, date: '2026-10-04' });
    expect(c.headline).toBe('2 LAPS + 3 SECTORS');
    // (on the card on two lines, the sectors under the laps; a whole number of laps, or sectors alone, on one)
    expect(splitDistance(c.headline)).toEqual(['2 LAPS', '+ 3 SECTORS']);
    expect(splitDistance('4 LAPS')).toEqual(['4 LAPS']);
    expect(splitDistance('2 SECTORS')).toEqual(['2 SECTORS']);
    expect(c.sub).toBe('GOLD MEDAL · NEW RECORD');
    expect(c.medal).toBe('gold');
    // (the text says it in words)
    expect(shareText(c)).toMatch(/^I reached 2 laps \+ 3 sectors at Oasis/);
  });
});

describe("a Championship's card", () => {
  const team = { name: 'Milk Energy', body: '#1b2a5a', trim: '#f2c14e' };
  const card = (o: Partial<Parameters<typeof seasonCard>[0]>) =>
    seasonCard({ mode: 'NORMAL · SPRINT', place: 3, field: 10, points: 40, wins: 1, podiums: 2, round: 4, rounds: 10, over: false, team, date: '2026-10-05', ...o });

  it('mid-season: your place after the rounds raced, your points, wins and podiums', () => {
    const c = card({});
    expect(c).toMatchObject({ circuit: 'CHAMPIONSHIP', headline: 'P3', sub: 'AFTER ROUND 4 OF 10', medal: undefined });
    expect(c.stats).toEqual([['POINTS', '40'], ['WINS', '1'], ['PODIUMS', '2']]);
    expect(shareText(c)).toMatch(/^I am P3 in the championship after round 4 of 10 in Corner Cutters/);
  });

  it('over: the title between gold cups, the podium in its colour', () => {
    const won = card({ over: true, place: 1, round: 10 });
    expect(won).toMatchObject({ sub: 'CHAMPION', medal: 'gold' });
    expect(shareText(won)).toMatch(/^I won the championship 🏆 in Corner Cutters/);
    expect(card({ over: true, place: 2, round: 10 })).toMatchObject({ sub: 'P2 OF 10 IN THE STANDINGS', medal: 'silver' });
    const fifth = card({ over: true, place: 5, round: 10 });
    expect(fifth.medal).toBeUndefined();
    expect(shareText(fifth)).toMatch(/^I finished the championship P5 in Corner Cutters/);
  });

  it("is made from your season: a win in the only round raced, P1 on 25 points", () => {
    const s = newSeason({ seed: 3, team: TEAMS[0], difficulty: 'normal', qualifying: false, rounds: ['crescent-park', 'silver-heath'], total: 10 });
    recordRound(s, [s.you, ...s.drivers.map((_, k) => k).filter((k) => k !== s.you)]);
    const c = seasonShareCard(s, new Date(2026, 9, 5));
    expect(c).toMatchObject({ headline: 'P1', sub: 'AFTER ROUND 1 OF 2', date: '2026-10-05' });
    expect(c.stats).toEqual([['POINTS', '25'], ['WINS', '1'], ['PODIUMS', '1']]);
  });
});
