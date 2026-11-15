// The music's memory: a composed track decoded whole is far bigger than its file (the theme's 158 s were 61 MB, the
// three together 130 MB, kept all session), so it's streamed instead, decoded only where it can't be; and with MUSIC
// off nothing is read at all (src/engine/music.ts). Web Audio, <audio> and the files are stood in for here.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { musicHeld, musicPlaying, playMusic, setMusicVolume, stopMusic, type Track } from '../src/engine/music';

const fetched: string[] = [];
/** decoded tracks started (their file's length, s) */
const decodedStarted: number[] = [];
/** whether the next <audio> can play its file */
let playable = true;

class FakeAudio {
  static made: FakeAudio[] = [];
  preload = '';
  src: string | undefined;
  currentTime = 0;
  duration = 120;
  paused = true;
  plays = 0;
  listeners: Record<string, (() => void)[]> = {};
  constructor() {
    FakeAudio.made.push(this);
  }
  addEventListener(type: string, f: () => void) {
    (this.listeners[type] ??= []).push(f);
  }
  emit(type: string) {
    for (const f of this.listeners[type] ?? []) f();
  }
  play() {
    if (!playable) return Promise.reject(Object.assign(new Error('no'), { name: 'NotSupportedError' }));
    this.plays++;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = undefined;
  }
  load() {}
}

const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ gain: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: (to: unknown) => to, disconnect() {} });
let context: FakeContext;
class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = node();
  watchers: (() => void)[] = [];
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the test reaches the one context the code made
    context = this;
  }
  addEventListener(_type: string, f: () => void) {
    this.watchers.push(f);
  }
  removeEventListener(_type: string, f: () => void) {
    this.watchers = this.watchers.filter((w) => w !== f);
  }
  to(state: string) {
    this.state = state;
    for (const w of [...this.watchers]) w();
  }
  createGain = node;
  createDynamicsCompressor = node;
  createMediaElementSource = node;
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  createBufferSource() {
    const source = { buffer: undefined as { duration: number } | undefined, loop: false, loopStart: 0, loopEnd: 0, connect: (to: unknown) => to, start: () => void decodedStarted.push(source.buffer!.duration), stop() {} };
    return source;
  }
  decodeAudioData = async (data: ArrayBuffer) => ({ duration: new Float64Array(data)[0] });
  suspend = async () => {};
  resume = async () => {};
}

const THEME: Track = { id: 'theme', file: 'music/theme.mp3' };
const RACE: Track = { id: 'race', file: 'music/race.mp3', loopStart: 0.19, loopEnd: 119.92 };
const PODIUM: Track = { id: 'podium', file: 'music/podium.mp3' };

/** the two elements of the track streaming now (the last made), and the one of them playing */
const pair = () => FakeAudio.made.slice(-2);
const latest = () => pair().find((el) => !el.paused) ?? pair()[0];
/** the fades run out, and the loads and their thens */
const settle = async () => {
  await vi.advanceTimersByTimeAsync(5000);
};

beforeAll(() => {
  vi.useFakeTimers();
  const items = new Map<string, string>();
  const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  useSave(CC_SAVE, store);
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('fetch', async (file: string) => {
    fetched.push(file);
    return { ok: true, arrayBuffer: async () => new Float64Array([158]).buffer };
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
beforeEach(async () => {
  stopMusic(0);
  await settle();
  setMusicVolume(0.7);
  playable = true;
  FakeAudio.made.length = 0;
  fetched.length = 0;
  decodedStarted.length = 0;
});

describe("the music's memory", () => {
  it('streams a composed track: its file is never read whole and decoded, and nothing of it is held', async () => {
    playMusic(THEME);
    await settle();
    // (two elements: one playing, one waiting at the start for the loop)
    expect(FakeAudio.made.length).toBe(2);
    expect(pair().map((el) => [el.src, el.paused])).toEqual([['music/theme.mp3', false], ['music/theme.mp3', true]]);
    expect(fetched).toEqual([]);
    expect(musicHeld()).toEqual([]);
    expect(musicPlaying()).toBe('theme');
  });

  it('lets the track before go as the next takes over: stopped, and its file let go of', async () => {
    playMusic(THEME);
    const theme = pair();
    playMusic(RACE);
    // (the two cross over the fade, then the first is gone)
    expect(theme[0].paused).toBe(false);
    await settle();
    for (const el of theme) expect(el).toMatchObject({ paused: true, src: undefined });
    expect(latest()).toMatchObject({ src: 'music/race.mp3', paused: false });
    // (the same track asked for again carries on: no second stream)
    playMusic(RACE);
    expect(FakeAudio.made.length).toBe(4);
  });

  it("stops with the game's sound (a pause, the app put away) and carries on from where it was", async () => {
    playMusic(THEME);
    const el = latest();
    el.currentTime = 42;
    context.to('suspended');
    expect(el.paused).toBe(true);
    context.to('running');
    expect(el.paused).toBe(false);
    expect(el.currentTime).toBe(42);
  });

  it("loops by handing over to the element waiting at the loop's start, as the one playing reaches its end", async () => {
    playMusic(RACE);
    const [a, b] = pair();
    // (both from the loop's start: what's before it is the file's lead-in)
    expect([a.currentTime, b.currentTime]).toEqual([0.19, 0.19]);
    a.currentTime = 100;
    a.emit('timeupdate');
    await vi.advanceTimersByTimeAsync(1000);
    expect([a.paused, b.paused]).toEqual([false, true]);
    // (0.3 s from the loop's end: the hand-over timed for then, once)
    a.currentTime = 119.62;
    a.emit('timeupdate');
    a.emit('timeupdate');
    await vi.advanceTimersByTimeAsync(250);
    expect([a.paused, b.paused]).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(100);
    expect([a.paused, b.paused]).toEqual([true, false]);
    // (the first back at the loop's start, waiting for its turn; and round again)
    expect(a.currentTime).toBe(0.19);
    b.currentTime = 119.9;
    b.emit('timeupdate');
    await vi.advanceTimersByTimeAsync(50);
    expect([a.paused, b.paused]).toEqual([false, true]);
    expect(a.plays + b.plays).toBe(3);
  });

  it('loops a track without loop points at its end (or as the file ends, if that comes first)', async () => {
    playMusic(PODIUM);
    const [a, b] = pair();
    a.currentTime = a.duration - 0.2;
    a.emit('timeupdate');
    a.emit('ended');
    expect([a.paused, b.paused, a.currentTime]).toEqual([true, false, 0]);
    // (the hand-over timed before isn't made a second time)
    await vi.advanceTimersByTimeAsync(500);
    expect([a.paused, b.paused]).toEqual([true, false]);
  });

  it("decodes a track that won't stream, as before, so there's still music", async () => {
    playable = false;
    playMusic(THEME);
    await settle();
    expect(fetched).toEqual(['music/theme.mp3']);
    expect(decodedStarted).toEqual([158]);
    expect(musicHeld()).toEqual(['theme']);
    for (const el of pair()) expect(el).toMatchObject({ paused: true, src: undefined });
  });

  it('with MUSIC off reads nothing, and starts the track wanted once it is turned up', async () => {
    setMusicVolume(0);
    playMusic(THEME);
    playMusic(PODIUM);
    await settle();
    expect(FakeAudio.made.length).toBe(0);
    expect(fetched).toEqual([]);
    expect(musicPlaying()).toBe('podium');
    setMusicVolume(0.35);
    await settle();
    expect(FakeAudio.made.length).toBe(2);
    expect(latest()).toMatchObject({ src: 'music/podium.mp3', paused: false });
    // (a change of volume while it plays starts nothing again)
    setMusicVolume(0.7);
    expect(FakeAudio.made.length).toBe(2);
    // (turned off while it plays: stopped and let go)
    setMusicVolume(0);
    await settle();
    for (const el of pair()) expect(el).toMatchObject({ paused: true, src: undefined });
    expect(musicPlaying()).toBe('podium');
  });
});
