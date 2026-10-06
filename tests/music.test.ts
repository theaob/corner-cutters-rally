import { describe, expect, it } from 'vitest';
import { foldTail, musicPlaying, musicVolume, playMusic, setMusicVolume, stopMusic } from '../src/engine/music';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { MENU_MUSIC, PODIUM_MUSIC, RACE_MUSIC, THEME_MUSIC, menuSong, placeholder, podiumSong, raceSong, themeSong, type Song } from '../src/f1/music';

describe("a loop's tail", () => {
  it('is folded back over its start, so notes ring on across the join', () => {
    const data = new Float32Array([1, 2, 3, 4, 10, 20, 30]);
    expect([...foldTail(data, 4)]).toEqual([11, 22, 33, 4]);
    // a tail longer than the loop wraps round again
    expect([...foldTail(new Float32Array([1, 1, 5, 5, 7]), 2)]).toEqual([13, 6]);
  });
});

/** Pitch classes (0 = C) of a key's scale. */
const scale = (tonic: number, minor: boolean) => (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((s) => (s + tonic) % 12);

describe.each([
  ['menu', menuSong(), scale(9, true)],
  ['race', raceSong(), scale(4, true)],
  ['podium', podiumSong(), scale(9, false)],
  ['theme', themeSong(), scale(2, true)],
] as [string, Song, number[]][])('the %s placeholder', (_, song, key) => {
  it('keeps every note inside the loop', () => {
    const beats = song.bars * 4;
    for (const n of song.notes) {
      expect(n.at).toBeGreaterThanOrEqual(0);
      expect(n.at + n.len).toBeLessThanOrEqual(beats + 1e-9);
      expect(n.vel).toBeGreaterThan(0);
      expect(n.vel).toBeLessThanOrEqual(1);
    }
  });

  it('stays in its key (the walking bass may step through a passing note)', () => {
    const pitched = song.notes.filter((n) => !['kick', 'snare', 'hat', 'crash'].includes(n.voice));
    const out = pitched.filter((n) => !key.includes(((n.midi % 12) + 12) % 12));
    expect(out.length).toBeLessThanOrEqual(pitched.filter((n) => n.voice === 'bass').length / 8);
  });

  it('keeps its tunes in a range that sounds (bass low, leads high)', () => {
    for (const n of song.notes) if (n.voice === 'bass') expect(n.midi).toBeLessThan(60);
    for (const n of song.notes) if (['lead', 'arp', 'brass', 'stab', 'pulse'].includes(n.voice)) expect(n.midi).toBeGreaterThanOrEqual(58);
  });

  it('loops in whole bars', () => {
    expect(placeholder(song).seconds).toBeCloseTo((song.bars * 4 * 60) / song.bpm);
  });
});

describe('the tracks', () => {
  it('play under the sounds, the race quieter still (under the engines)', () => {
    expect(RACE_MUSIC.gain!).toBeLessThan(MENU_MUSIC.gain!);
    expect(new Set([MENU_MUSIC.id, RACE_MUSIC.id, PODIUM_MUSIC.id, THEME_MUSIC.id]).size).toBe(4);
  });
});

describe('the music without Web Audio (tests, old browsers)', () => {
  it('does nothing, quietly, and its volume is still a setting', () => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
    expect(musicVolume()).toBe(0.7);
    setMusicVolume(0.35);
    expect(JSON.parse(items.get('cc:save')!).data.settings.music).toBe(0.35);
    expect(() => {
      playMusic(MENU_MUSIC);
      stopMusic();
    }).not.toThrow();
    expect(musicPlaying()).toBeUndefined();
  });
});

describe('the recorded songs', () => {
  it('play the theme on the landing screen and "Triumphal Fanfare" for the champagne, each with its placeholder should the file not load', async () => {
    const { existsSync } = await import('node:fs');
    for (const [track, file] of [[THEME_MUSIC, 'music/theme.mp3'], [PODIUM_MUSIC, 'music/podium.mp3']] as const) {
      expect(track.file).toBe(file);
      expect(existsSync(`public/${file}`)).toBe(true);
      expect(track.placeholder).toBeDefined();
    }
  });
});
