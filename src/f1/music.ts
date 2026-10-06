// The game's music. Each track is a composed file once it's in (put it in
// public/music/ and set `file`); until then a placeholder plays: a chiptune
// loop to suit the pixel look, written here as notes and synthesised on the
// device (engine/music.ts renders and loops it).
//
//   menu  A minor, 96 bpm, 8 bars: arpeggios over Am F C G, a soft pad, a walking bass
//   race  E minor, 150 bpm, 8 bars: a driving octave bass, drums, a lead riff over Em C G D
//         (under the engines: it plays quieter)
//   theme D minor, 124 bpm, 8 bars: the landing (menu) screen's anthem, cinematic racing TV theme in
//         style (an original tune): a 16th-note synth pulse, a heroic brass tune climbing over
//         Dm Bb F C | Dm Bb Gm A, string pads, a pumping octave bass, big drums and cymbals
//   podium  A major, 120 bpm, 8 bars: a triumphal march in the manner of a bullring parade (the
//         spirit of Bizet's "Les Toréadors"; an original tune): dotted brass fanfares in thirds,
//         an oom-pah tuba and chords, a marching snare with a roll back into the top, cymbals on the
//         phrases. For the winners driving into their spots after the race.
//
// The notes are plain data (tested: in key, inside the loop); `voice` plays one.

import type { Placeholder, Track } from '../engine/music';

export type Voice = 'lead' | 'arp' | 'pad' | 'bass' | 'kick' | 'snare' | 'hat' | 'brass' | 'stab' | 'crash' | 'pulse';

export interface Note {
  /** start and length, in beats */
  at: number;
  len: number;
  /** MIDI note number (drums: ignored) */
  midi: number;
  voice: Voice;
  /** 0…1 */
  vel: number;
}

export interface Song {
  bpm: number;
  bars: number;
  notes: Note[];
}

const BEATS = 4;

/** A chord as MIDI notes, root first. */
const chord = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7];

/** The menu: four chords, two bars each. */
export function menuSong(): Song {
  const notes: Note[] = [];
  // Am F C G, from A3
  const chords = [chord(57, true), chord(53, false), chord(60, false), chord(55, false)];
  const arp = [0, 1, 2, 1, 2, 0, 1, 2];
  chords.forEach((c, k) => {
    const bar = k * 2 * BEATS;
    // the pad: the chord held for both bars
    for (const m of c) notes.push({ at: bar, len: 2 * BEATS, midi: m, voice: 'pad', vel: 0.35 });
    // arpeggios in eighths, an octave up, rising on the second bar
    for (let i = 0; i < 16; i++) notes.push({ at: bar + i / 2, len: 0.45, midi: c[arp[i % 8]] + (i >= 8 && i % 8 >= 4 ? 24 : 12), voice: 'arp', vel: i % 2 ? 0.45 : 0.6 });
    // a walking bass: root, fifth, root, and a step to the next chord's root
    const next = chords[(k + 1) % chords.length][0];
    [c[0], c[0] + 7, c[0], next - 1].forEach((m, i) => notes.push({ at: bar + i * 2, len: 1.8, midi: m - 24, voice: 'bass', vel: 0.7 }));
    // soft off-beat hats
    for (let i = 0; i < 8; i++) notes.push({ at: bar + i + 0.5, len: 0.1, midi: 0, voice: 'hat', vel: 0.25 });
  });
  return { bpm: 96, bars: 8, notes };
}

/** The race: four chords, two bars each, with a riff. */
export function raceSong(): Song {
  const notes: Note[] = [];
  // Em C G D, from E3
  const chords = [chord(52, true), chord(48, false), chord(55, false), chord(50, false)];
  chords.forEach((c, k) => {
    const bar = k * 2 * BEATS;
    for (let b = 0; b < 2; b++) {
      const at = bar + b * BEATS;
      // the bass: driving eighths, jumping the octave
      [0, 0, 12, 0, 0, 12, 0, 7].forEach((step, i) => notes.push({ at: at + i / 2, len: 0.4, midi: c[0] - 12 + step, voice: 'bass', vel: i % 2 ? 0.6 : 0.8 }));
      // drums: kick on 1, the and of 2, and 3; snare on 2 and 4; hats in eighths
      for (const t of [0, 1.5, 2]) notes.push({ at: at + t, len: 0.2, midi: 0, voice: 'kick', vel: 0.9 });
      for (const t of [1, 3]) notes.push({ at: at + t, len: 0.2, midi: 0, voice: 'snare', vel: 0.7 });
      for (let i = 0; i < 8; i++) notes.push({ at: at + i / 2, len: 0.05, midi: 0, voice: 'hat', vel: i % 2 ? 0.25 : 0.4 });
    }
    // the riff, on the chord's notes an octave up: a run up in the first bar, a held note and a fall in the second
    const [r, third, fifth] = c.map((m) => m + 12);
    [r, fifth, third, fifth, r + 12, fifth, third, fifth].forEach((m, i) => notes.push({ at: bar + i / 2, len: 0.45, midi: m, voice: 'lead', vel: 0.55 }));
    notes.push({ at: bar + BEATS, len: 1.9, midi: fifth, voice: 'lead', vel: 0.6 });
    notes.push({ at: bar + BEATS + 2, len: 0.9, midi: third, voice: 'lead', vel: 0.5 });
    notes.push({ at: bar + BEATS + 3, len: 0.9, midi: r, voice: 'lead', vel: 0.5 });
  });
  return { bpm: 150, bars: 8, notes };
}

/** The landing screen's anthem: D minor, over Dm Bb F C | Dm Bb Gm A (the A pulling back to the top). */
export function themeSong(): Song {
  const notes: Note[] = [];
  const A4 = 69, Bb4 = 70, C5 = 72, Cs5 = 73, D5 = 74, E5 = 76, F5 = 77, G5 = 79, A5 = 81, Bb5 = 82;
  // the chords (from the octave below middle C) and the bass's roots
  const chords: number[][] = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53], [55, 58, 62], [57, 61, 64]];
  // the tune, bar by bar: [beat, beats, midi]; a rising call in the first phrase, an answer that climbs higher in the second
  const tune: [number, number, number][][] = [
    [[0, 1.5, D5], [1.5, 0.5, A4], [2, 1, D5], [3, 1, F5]],
    [[0, 1.5, F5], [1.5, 0.5, E5], [2, 1, D5], [3, 1, Bb5]],
    [[0, 2, A5], [2, 1, G5], [3, 1, F5]],
    [[0, 3, E5], [3, 1, C5]],
    [[0, 1.5, D5], [1.5, 0.5, A4], [2, 1, D5], [3, 1, F5]],
    [[0, 1.5, G5], [1.5, 0.5, F5], [2, 1, D5], [3, 1, Bb4]],
    [[0, 2, Bb5], [2, 1, A5], [3, 1, G5]],
    [[0, 2, A5], [2, 1, E5], [3, 1, Cs5]],
  ];
  tune.forEach((bar, k) => bar.forEach(([at, len, midi]) => notes.push({ at: k * BEATS + at, len: len * 0.92, midi, voice: 'brass', vel: len >= 1 ? 0.75 : 0.6 })));
  chords.forEach((c, k) => {
    const bar = k * BEATS;
    // the pulse: 16ths over the chord (root, fifth, octave, fifth), accents on the beat
    const [r, , fifth] = c;
    for (let i = 0; i < 16; i++) notes.push({ at: bar + i / 4, len: 0.2, midi: [r, fifth, r + 12, fifth][i % 4] + 12, voice: 'pulse', vel: i % 4 === 0 ? 0.7 : 0.45 });
    // strings: the chord held
    for (const m of c) notes.push({ at: bar, len: BEATS, midi: m + 12, voice: 'pad', vel: 0.45 });
    // the bass: octaves in eighths
    for (let i = 0; i < 8; i++) notes.push({ at: bar + i / 2, len: 0.4, midi: r - 12 + (i % 2 ? 12 : 0), voice: 'bass', vel: i % 2 ? 0.55 : 0.8 });
    // drums: a big kick on 1 and 3 (and the and of 4 driving into the next bar), the snare on 2 and 4, hats in eighths
    for (const t of [0, 2, 3.5]) notes.push({ at: bar + t, len: 0.2, midi: 0, voice: 'kick', vel: t === 3.5 ? 0.6 : 0.95 });
    for (const t of [1, 3]) notes.push({ at: bar + t, len: 0.2, midi: 0, voice: 'snare', vel: 0.75 });
    for (let i = 0; i < 8; i++) notes.push({ at: bar + i / 2, len: 0.05, midi: 0, voice: 'hat', vel: i % 2 ? 0.2 : 0.3 });
  });
  for (const bar of [0, 4]) notes.push({ at: bar * BEATS, len: 1, midi: 0, voice: 'crash', vel: 0.65 });
  // a snare fill into the top
  for (let i = 0; i < 4; i++) notes.push({ at: 7 * BEATS + 3 + i / 4, len: 0.1, midi: 0, voice: 'snare', vel: 0.45 + i * 0.1 });
  return { bpm: 124, bars: 8, notes };
}

/** A major's scale (pitch classes), for the brass's second part a third below the tune. */
const A_MAJOR = [9, 11, 1, 2, 4, 6, 8];

/** The note two steps down the A major scale from `midi` (a third below, in key). */
function thirdBelow(midi: number): number {
  let m = midi - 1;
  let steps = 0;
  while (steps < 2) {
    if (A_MAJOR.includes(((m % 12) + 12) % 12)) steps++;
    if (steps < 2) m--;
  }
  return m;
}

/** The podium march: A major, a fanfare tune over A A E7 A | D A E7 A. */
export function podiumSong(): Song {
  const notes: Note[] = [];
  // the tune, bar by bar, as [beat in the bar, beats long, midi]: dotted fanfare figures, leaps to the top A
  const A4 = 69, B4 = 71, Cs5 = 73, D5 = 74, E5 = 76, Fs5 = 78, Gs5 = 80, A5 = 81, B5 = 83;
  const tune: [number, number, number][][] = [
    [[0, 0.75, E5], [0.75, 0.25, E5], [1, 1, A5], [2, 0.5, E5], [2.5, 0.5, Cs5], [3, 1, A4]],
    [[0, 0.5, Cs5], [0.5, 0.5, D5], [1, 0.75, E5], [1.75, 0.25, Fs5], [2, 2, E5]],
    [[0, 0.75, D5], [0.75, 0.25, D5], [1, 1, Gs5], [2, 0.5, Fs5], [2.5, 0.5, E5], [3, 0.5, D5], [3.5, 0.5, B4]],
    [[0, 1, Cs5], [1, 1, E5], [2, 2, A5]],
    [[0, 0.75, Fs5], [0.75, 0.25, Fs5], [1, 1, A5], [2, 0.5, Fs5], [2.5, 0.5, D5], [3, 1, A4]],
    [[0, 0.75, E5], [0.75, 0.25, E5], [1, 0.5, Cs5], [1.5, 0.5, E5], [2, 2, A5]],
    [[0, 0.5, Gs5], [0.5, 0.5, A5], [1, 1, B5], [2, 0.5, Gs5], [2.5, 0.5, E5], [3, 1, D5]],
    [[0, 0.5, Cs5], [0.5, 0.5, E5], [1, 1, A5], [2, 1, A4]],
  ];
  tune.forEach((bar, k) =>
    bar.forEach(([at, len, midi]) => {
      notes.push({ at: k * BEATS + at, len: len * 0.9, midi, voice: 'brass', vel: at % 1 ? 0.6 : 0.75 });
      // the second brass a third below, on the longer notes
      if (len >= 1) notes.push({ at: k * BEATS + at, len: len * 0.9, midi: thirdBelow(midi), voice: 'brass', vel: 0.45 });
    }),
  );
  // the harmony: A A E7 A D A E7 A; the tuba on the beat (root, then fifth below), the chords off it
  const roots = [45, 45, 40, 45, 38, 45, 40, 45];
  const chords: number[][] = [[61, 64, 69], [61, 64, 69], [62, 64, 68], [61, 64, 69], [62, 66, 69], [61, 64, 69], [62, 64, 68], [61, 64, 69]];
  roots.forEach((root, k) => {
    const bar = k * BEATS;
    notes.push({ at: bar, len: 0.8, midi: root, voice: 'bass', vel: 0.85 });
    notes.push({ at: bar + 2, len: 0.8, midi: root - 5, voice: 'bass', vel: 0.75 });
    for (const off of [1, 3]) for (const m of chords[k]) notes.push({ at: bar + off, len: 0.35, midi: m, voice: 'stab', vel: 0.5 });
    // the march: kick on the beat, snare on the off-beats with an accent on 2 and 4
    for (const t of [0, 2]) notes.push({ at: bar + t, len: 0.2, midi: 0, voice: 'kick', vel: 0.8 });
    for (let i = 0; i < 8; i++) if (i % 2) notes.push({ at: bar + i / 2, len: 0.1, midi: 0, voice: 'snare', vel: i === 3 || i === 7 ? 0.6 : 0.35 });
  });
  // cymbals on each phrase, and a snare roll in the last bar back into the top
  for (const bar of [0, 4]) notes.push({ at: bar * BEATS, len: 1, midi: 0, voice: 'crash', vel: 0.7 });
  for (let i = 0; i < 8; i++) notes.push({ at: 7 * BEATS + 3 + i / 8, len: 0.06, midi: 0, voice: 'snare', vel: 0.3 + i * 0.05 });
  return { bpm: 120, bars: 8, notes };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A second of white noise for the drums, in `ctx`. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 7;
  // (seeded, so the placeholder sounds the same every time)
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  return b;
}

/** An envelope on a new gain: a quick attack, held, then released over `release` s. */
function envelope(ctx: BaseAudioContext, t: number, len: number, peak: number, release: number, attack = 0.005): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + Math.max(attack, len));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, len) + release);
  return g;
}

/** Play one note of `voice` at `t` (s) for `len` (s) into `out`. */
function voice(ctx: BaseAudioContext, out: AudioNode, n: Note, t: number, len: number, noiseBuf: AudioBuffer): void {
  const tone = (type: OscillatorType, freq: number, peak: number, release: number, cutoff?: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = envelope(ctx, t, len, peak * n.vel, release);
    let node: AudioNode = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      node = o.connect(f);
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + release + 0.05);
    return o;
  };
  const hit = (type: BiquadFilterType, freq: number, peak: number, decay: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * n.vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(f).connect(g).connect(out);
    s.start(t);
    s.stop(t + decay + 0.02);
  };
  switch (n.voice) {
    case 'lead': {
      // a square with a little vibrato, as a chip lead
      const o = tone('square', hz(n.midi), 0.16, 0.12, 3200);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.value = 9;
      lfo.connect(depth).connect(o.detune);
      lfo.start(t);
      lfo.stop(t + len + 0.2);
      break;
    }
    case 'arp':
      tone('triangle', hz(n.midi), 0.3, 0.25);
      tone('square', hz(n.midi), 0.05, 0.1, 2400);
      break;
    case 'pad':
      tone('sawtooth', hz(n.midi), 0.07, 0.8, 900, -7);
      tone('sawtooth', hz(n.midi), 0.07, 0.8, 900, 7);
      break;
    case 'bass':
      tone('triangle', hz(n.midi), 0.5, 0.06);
      tone('square', hz(n.midi), 0.08, 0.05, 700);
      break;
    case 'kick': {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9 * n.vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.3);
      break;
    }
    case 'snare':
      hit('bandpass', 1800, 0.6, 0.16);
      tone('triangle', 185, 0.3, 0.05);
      break;
    case 'hat':
      hit('highpass', 7500, 0.35, 0.05);
      break;
    case 'brass': {
      // a saw and a square, the filter opening with each note's attack (the brass's bite), and a little vibrato
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 1.5;
      f.frequency.setValueAtTime(600, t);
      f.frequency.linearRampToValueAtTime(3400, t + 0.04);
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
      const g = envelope(ctx, t, len, 0.16 * n.vel, 0.1, 0.02);
      f.connect(g).connect(out);
      for (const [type, detune, level] of [['sawtooth', 0, 1], ['square', 5, 0.35]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = hz(n.midi);
        o.detune.value = detune;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        const depth = ctx.createGain();
        depth.gain.value = len > 0.8 ? 7 : 0;
        lfo.connect(depth).connect(o.detune);
        const lv = ctx.createGain();
        lv.gain.value = level;
        o.connect(lv).connect(f);
        for (const x of [o, lfo]) {
          x.start(t);
          x.stop(t + len + 0.2);
        }
      }
      break;
    }
    case 'stab':
      tone('square', hz(n.midi), 0.05, 0.05, 2200);
      tone('triangle', hz(n.midi), 0.08, 0.06);
      break;
    case 'pulse':
      // a short, bright synth pulse
      tone('square', hz(n.midi), 0.09, 0.04, 2600);
      tone('sawtooth', hz(n.midi), 0.05, 0.04, 1800, 6);
      break;
    case 'crash':
      hit('highpass', 5000, 0.45, 1.4);
      hit('bandpass', 9000, 0.2, 0.9);
      break;
  }
}

/** A song as a placeholder loop. */
export function placeholder(song: Song): Placeholder {
  const beat = 60 / song.bpm;
  return {
    seconds: song.bars * BEATS * beat,
    build(ctx) {
      const buf = noise(ctx);
      const out = ctx.createGain();
      out.connect(ctx.destination);
      for (const n of song.notes) voice(ctx, out, n, n.at * beat, n.len * beat, buf);
    },
  };
}

export const MENU_MUSIC: Track = { id: 'menu', placeholder: placeholder(menuSong()), gain: 0.8 };
// (the composed race track, "Relentless Momentum": its two minutes looped from the first sound to the last, under the
// engines; the placeholder plays if it won't load)
export const RACE_MUSIC: Track = { id: 'race', file: 'music/race.mp3', loopStart: 0.19, loopEnd: 119.92, placeholder: placeholder(raceSong()), gain: 0.5 };
// (the composed theme, "Triumph in Motion"; the placeholder plays if it won't load)
export const THEME_MUSIC: Track = { id: 'theme', file: 'music/theme.mp3', placeholder: placeholder(themeSong()), gain: 0.8 };
export const PODIUM_MUSIC: Track = { id: 'podium', file: 'music/podium.mp3', placeholder: placeholder(podiumSong()), gain: 0.95 };
