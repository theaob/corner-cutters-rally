import { describe, expect, it } from 'vitest';
import { ImpactStyle } from '@capacitor/haptics';
import { impactFor } from '../src/engine/haptics';
import { RUMBLE } from '../src/f1/rumble';

describe('an iPhone tap for a buzz', () => {
  it('is light for the kerbs and the grass, medium for a crash, heavy for a wreck', () => {
    expect(impactFor(RUMBLE.kerbMs)).toBe(ImpactStyle.Light);
    expect(impactFor(RUMBLE.roughMsAtTop)).toBe(ImpactStyle.Light);
    expect(impactFor(RUMBLE.landingMs)).toBe(ImpactStyle.Medium);
    expect(impactFor(RUMBLE.hit)).toBe(ImpactStyle.Medium);
    expect(impactFor(RUMBLE.wreck)).toBe(ImpactStyle.Heavy);
  });
});
