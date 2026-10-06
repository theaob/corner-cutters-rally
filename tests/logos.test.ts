import { describe, expect, it } from 'vitest';
import { LOGOS } from '../src/f1/logos';
import { TEAMS } from '../src/f1/teams';

describe('team logos', () => {
  it('has one for every team, and no logo for a team that does not exist', () => {
    expect(Object.keys(LOGOS).sort()).toEqual(TEAMS.map((t) => t.id).sort());
  });

  it('are clean SVG: only drawing elements, groups closed, no missing values', () => {
    for (const [id, art] of Object.entries(LOGOS)) {
      expect(art, id).not.toMatch(/undefined|NaN|<script|on\w+=/);
      const tags = [...art.matchAll(/<(\/?)([a-z]+)/g)].map((m) => m[2]);
      for (const tag of tags) expect(['circle', 'ellipse', 'rect', 'path', 'g', 'text'], `${id}: <${tag}>`).toContain(tag);
      expect((art.match(/<g[\s>]/g) ?? []).length, id).toBe((art.match(/<\/g>/g) ?? []).length);
    }
  });
});
