import { describe, expect, it } from 'vitest';
import { emptyRecords, parseRecords, recordLap, recordQualifying, recordRace } from '../src/f1/records';

describe('records', () => {
  it('keep the fastest lap on each circuit', () => {
    const r = emptyRecords();
    expect(recordLap(r, 'crescent-park', 25.4)).toBe(true); // the first lap is a record
    expect(recordLap(r, 'crescent-park', 26)).toBe(false);
    expect(recordLap(r, 'crescent-park', 25.4)).toBe(false); // equalling it isn't
    expect(recordLap(r, 'crescent-park', 24.9)).toBe(true);
    expect(recordLap(r, 'silver-heath', 29)).toBe(true);
    expect(r.circuits['crescent-park'].bestLap).toBe(24.9);
    expect(r.circuits['silver-heath'].bestLap).toBe(29);
  });

  it('keep the fastest race for each number of laps', () => {
    const r = emptyRecords();
    expect(recordRace(r, 'crescent-park', 3, 76)).toBe(true);
    expect(recordRace(r, 'crescent-park', 1, 26)).toBe(true); // a different length of race
    expect(recordRace(r, 'crescent-park', 3, 77)).toBe(false);
    expect(recordRace(r, 'crescent-park', 3, 75.5)).toBe(true);
    expect(r.circuits['crescent-park'].bestRace).toEqual({ 1: 26, 3: 75.5 });
  });

  it('keep the fastest qualifying lap apart from the race laps', () => {
    const r = emptyRecords();
    expect(recordLap(r, 'crescent-park', 25.4)).toBe(true);
    // a quicker qualifying lap is a qualifying record, and leaves the race's lap record as it was
    expect(recordQualifying(r, 'crescent-park', 24.2)).toBe(true);
    expect(recordQualifying(r, 'crescent-park', 24.5)).toBe(false);
    expect(r.circuits['crescent-park']).toMatchObject({ bestLap: 25.4, bestQualifying: 24.2 });
    // and a race lap slower than it is still a race lap record
    expect(recordLap(r, 'crescent-park', 25)).toBe(true);
    expect(r.circuits['crescent-park']).toMatchObject({ bestLap: 25, bestQualifying: 24.2 });
  });

  it('survive a save and a load', () => {
    const r = emptyRecords();
    recordLap(r, 'silver-heath', 28.7);
    recordQualifying(r, 'silver-heath', 27.9);
    recordRace(r, 'silver-heath', 5, 150.2);
    expect(parseRecords(JSON.stringify(r))).toEqual(r);
  });

  it('read a missing, corrupt or doctored save as whatever is valid in it', () => {
    expect(parseRecords(null)).toEqual(emptyRecords());
    expect(parseRecords('{not json')).toEqual(emptyRecords());
    const odd = JSON.stringify({ circuits: { a: { bestLap: -3, bestQualifying: 'quick', bestRace: { 3: 70, x: 5, 2: 'fast', 0: 10 } }, b: null } });
    expect(parseRecords(odd)).toEqual({ circuits: { a: { bestLap: undefined, bestRace: { 3: 70 } } } });
  });
});
