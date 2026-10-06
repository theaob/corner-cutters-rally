import { describe, expect, it } from 'vitest';
import { versionText } from '../src/f1/settingsRows';

describe('the version under the settings', () => {
  it('says the release and the build (the commit)', () => {
    expect(versionText('0.0.1+2790585')).toBe('VERSION 0.0.1 · BUILD 2790585');
    expect(versionText('1.2.0')).toBe('VERSION 1.2.0');
    expect(versionText('0.0.1+local')).toBe('VERSION 0.0.1 · BUILD LOCAL');
  });
});
