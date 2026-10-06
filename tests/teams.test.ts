import { describe, expect, it } from 'vitest';
import { TEAMS, TEAMS_PER_RACE, driverSeats, teamById, teamGrid } from '../src/f1/teams';

/** A repeatable random sequence. */
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const counts = (teams: { id: string }[]) => teams.reduce<Record<string, number>>((m, t) => ((m[t.id] = (m[t.id] ?? 0) + 1), m), {});

describe('teams', () => {
  it('are the eleven, each with its own id and three-letter code, and a livery in #rrggbb', () => {
    expect(TEAMS).toHaveLength(11);
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(11);
    expect(new Set(TEAMS.map((t) => t.code)).size).toBe(11);
    for (const t of TEAMS) {
      expect(t.code).toMatch(/^[A-Z]{3}$/);
      for (const c of [t.body, t.trim, ...(t.accent ? [t.accent] : [])]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(teamById('maas')?.accent).toBeDefined();
    expect(teamById('nobody')).toBeUndefined();
  });

  it('fill a full grid: you in your slot, your teammate elsewhere, five teams of two', () => {
    const yours = teamById('frankies-groove')!;
    const grid = teamGrid(yours, 10, 5, seeded(7));
    expect(grid).toHaveLength(10);
    expect(grid[5]).toBe(yours);
    const c = counts(grid);
    expect(Object.keys(c)).toHaveLength(TEAMS_PER_RACE);
    expect(Object.values(c).every((k) => k === 2)).toBe(true);
    expect(c[yours.id]).toBe(2);
  });

  it('seat each pair as the first and second driver (the second has the green T-camera), you in your team\'s first seat', () => {
    for (const seed of [11, 3, 7]) {
      const grid = teamGrid(TEAMS[2], 10, 5, seeded(seed));
      const seats = driverSeats(grid, 5);
      expect(seats[5]).toBe(0);
      for (const t of new Set(grid)) {
        const marks = grid.flatMap((g, i) => (g === t ? [seats[i]] : []));
        expect(marks.sort()).toEqual([0, 1]);
      }
    }
  });

  it('seat you in the car you picked, your teammate in the other', () => {
    for (const seed of [11, 3, 7]) {
      const grid = teamGrid(TEAMS[2], 10, 5, seeded(seed));
      const seats = driverSeats(grid, 5, 1);
      expect(seats[5]).toBe(1);
      const mate = grid.findIndex((t, i) => i !== 5 && t === grid[5]);
      expect(seats[mate]).toBe(0);
      // (the other teams as before)
      const before = driverSeats(grid, 5);
      grid.forEach((t, i) => t !== grid[5] && expect(seats[i]).toBe(before[i]));
    }
  });

  it('each have two drivers with their own three-letter codes, 22 in all', () => {
    const codes = TEAMS.flatMap((t) => t.drivers);
    expect(codes).toHaveLength(TEAMS.length * 2);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{3}$/);
    expect(new Set(codes).size).toBe(codes.length);
    expect(teamById('milk-energy')?.drivers).toEqual(['VER', 'HAD']);
  });

  it('draw different rivals from race to race', () => {
    const yours = TEAMS[0];
    const fields = new Set(Array.from({ length: 12 }, (_, s) => Object.keys(counts(teamGrid(yours, 10, 5, seeded(s + 1)))).sort().join()));
    expect(fields.size).toBeGreaterThan(3);
  });

  it('pair up on a smaller grid, your teammate first', () => {
    const yours = TEAMS[3];
    expect(teamGrid(yours, 1, 0)).toEqual([yours]);
    const four = teamGrid(yours, 4, 2, seeded(3));
    const c = counts(four);
    expect(c[yours.id]).toBe(2);
    // four cars: you, your teammate, and one rival team's pair
    expect(Object.values(c)).toEqual([2, 2]);
  });
});
