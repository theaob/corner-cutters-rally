import { describe, expect, it } from 'vitest';
import { PENS, PICTURE_MAX, REPORT_TEXT_MAX, reportPath, reportRow } from '../src/f1/report';
import { frameWanted, nextFrame } from '../src/engine/render/capture';

describe('a report', () => {
  it("goes in the bucket by the day it's made (UTC), under its own name", () => {
    expect(reportPath(new Date('2026-10-04T23:30:00Z'), 'abc')).toBe('2026-10-04/abc.jpg');
  });

  it('as a row: who, on what, where, what they said (trimmed, at most the limit) and the picture', () => {
    const row = reportRow({ player: 'p', platform: 'web', version: '1.0.0+abc', about: { circuit: 'baku', mode: 'race' }, screen: '390x844', text: '  the kerb  ', image: '2026-10-04/x.jpg' });
    expect(row).toEqual({ player: 'p', platform: 'web', version: '1.0.0+abc', circuit: 'baku', mode: 'race', screen: '390x844', text: 'the kerb', image: '2026-10-04/x.jpg', picture: null });
    // (the dashboard's copy of the picture, unless it's too big for the database)
    expect(reportRow({ player: 'p', platform: 'web', version: '1', about: {}, screen: '1x1', text: '', picture: 'data:image/jpeg;base64,AA' }).picture).toBe('data:image/jpeg;base64,AA');
    expect(reportRow({ player: 'p', platform: 'web', version: '1', about: {}, screen: '1x1', text: '', picture: 'x'.repeat(PICTURE_MAX + 1) }).picture).toBeNull();
    // (from the menu: no circuit or mode; the picture didn't go: none; too long: cut to the limit)
    const menu = reportRow({ player: 'p', platform: 'android', version: '1', about: {}, screen: '1280x800', text: 'x'.repeat(REPORT_TEXT_MAX + 50) });
    expect(menu).toMatchObject({ circuit: null, mode: null, image: null, picture: null });
    expect(menu.text).toHaveLength(REPORT_TEXT_MAX);
  });

  it('has its pens, red first', () => {
    expect(PENS[0]).toBe('#d8323c');
    expect(new Set(PENS).size).toBe(PENS.length);
  });
});

describe('a copy of the next frame', () => {
  it('is waited for (a stopped view draws one for it), and given up on if none is drawn', async () => {
    expect(frameWanted()).toBe(false);
    const waiting = nextFrame(20);
    expect(frameWanted()).toBe(true);
    expect(await waiting).toBeUndefined();
    expect(frameWanted()).toBe(false);
  });
});
