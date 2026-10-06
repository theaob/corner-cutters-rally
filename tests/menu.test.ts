import { describe, expect, it } from 'vitest';
import { MODES, rowsOf } from '../src/f1/circuitSelect';
import { versionText } from '../src/f1/settingsRows';
import { DUST_BOWL, GLACIER_PASS } from '../src/f1/layouts';

describe('the menu', () => {
  it('starts with the modes: the Daily Challenge, Quick Race, Championship, Time Attack and Time Trial', () => {
    expect(MODES.map((m) => m.name)).toEqual(['DAILY CHALLENGE', 'QUICK RACE', 'CHAMPIONSHIP', 'TIME ATTACK', 'TIME TRIAL']);
  });

  it("then shows each mode's own options with the circuit: a Quick Race's qualifying and laps, the time modes' team and weather", () => {
    expect(rowsOf('race')).toEqual(['team', 'car', 'weather', 'qualifying', 'laps', 'tyres']);
    expect(rowsOf('timeattack')).toEqual(['team', 'car', 'weather']);
    // (on dirt, no TYRES: off-road tyres are the only ones)
    expect(rowsOf('race', DUST_BOWL)).toEqual(['team', 'car', 'weather', 'qualifying', 'laps']);
    expect(rowsOf('race', GLACIER_PASS)).toContain('tyres');
    expect(rowsOf('timetrial')).toEqual(['team', 'car', 'weather']);
    // (the Daily Challenge too: the day's circuit and weather are everyone's)
    expect(rowsOf('daily')).toEqual([]);
    // (a Championship has its own screen: a season races every circuit)
    expect(rowsOf('championship')).toEqual([]);
  });
});

describe('the version under the settings', () => {
  it('says the release and the build (the commit)', () => {
    expect(versionText('0.0.1+2790585')).toBe('VERSION 0.0.1 · BUILD 2790585');
    expect(versionText('1.2.0')).toBe('VERSION 1.2.0');
    expect(versionText('0.0.1+local')).toBe('VERSION 0.0.1 · BUILD LOCAL');
  });
});
