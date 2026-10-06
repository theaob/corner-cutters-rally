// Sound, synthesised with Web Audio (no sound files: nothing to download, and it
// works offline in the app): continuous voices (an engine note, filtered noise
// for tyres, rumble and rain) the game sets every frame, and one-shots (beeps,
// thumps, chimes). Browsers only let a page make sound after a tap or a key, so
// the context starts on the first one. The engine is built as an engine sounds:
// a waveform from the crank's orders (the firing pulses strongest), two banks a
// touch apart, a soft clip for grit and a breath of exhaust noise. The volume is a setting kept on the
// device; without Web Audio (tests, old browsers) everything here does nothing.

import { save, saved } from './save';
import { gameHidden, hostSound, onHidden, onHostSound } from './host';

/** The volume steps offered in the settings. */
export const VOLUMES = [0, 0.35, 0.7, 1] as const;

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
/** the limiter everything plays through: the sounds, and the music (music.ts) */
let output: AudioNode | undefined;
/** the game has paused (its pause screen): stays silent when the page comes back */
let gamePaused = false;
let noiseBuffer: AudioBuffer | undefined;
let volume: number | undefined;

/** The sound volume, 0…1 (0.7 unless the player changed it). */
export function soundVolume(): number {
  if (volume === undefined) {
    const v = saved('settings', 'sound');
    volume = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
  }
  return volume;
}

/** Set the sound volume (0…1), and remember it. */
export function setSoundVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  save('settings', 'sound', volume);
}

/** The audio context and the output to play into (through the limiter); undefined without Web Audio. */
export function audioOut(): { ctx: AudioContext; out: AudioNode } | undefined {
  const c = audio();
  return c && output ? { ctx: c, out: output } : undefined;
}

/** The audio context, made (and resumed) on demand; undefined without Web Audio. */
function audio(): AudioContext | undefined {
  if (!ctx) {
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    try {
      ctx = new Ctor();
    } catch {
      return undefined;
    }
    master = ctx.createGain();
    master.gain.value = soundVolume();
    // a limiter at the end, so the engines' grit and a crash together never clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    output = limiter;
    // the game out of sight (another tab, the app in the background, YouTube's paused it), or the host's sound off
    // (YouTube's own switch): silent, on every screen, until it's back
    const settle = () => (gameHidden() || !hostSound() ? void ctx?.suspend().catch(() => {}) : !gamePaused && void ctx?.resume().catch(() => {}));
    onHidden(settle);
    onHostSound(settle);
    settle();
    // two seconds of white noise, looped by the noise voices
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** Start sound on the page's first tap or key (browsers require one), and whenever it comes back. */
export function unlockAudio(target: Window = window): void {
  const resume = () => {
    const c = audio();
    if (c && c.state !== 'running' && !gamePaused && hostSound() && !gameHidden()) void c.resume().catch(() => {});
  };
  target.addEventListener('pointerdown', resume, { capture: true });
  target.addEventListener('keydown', resume, { capture: true });
}

/** Silence everything (a pause, the app in the background), or bring it back. */
export function setAudioPaused(paused: boolean): void {
  gamePaused = paused;
  if (!ctx) return;
  if (paused || !hostSound() || gameHidden()) void ctx.suspend().catch(() => {});
  else void ctx.resume().catch(() => {});
}

/**
 * An engine note. `freq` is the firing frequency (Hz: the pitch you hear),
 * `gain` its loudness and `brightness` (0…1) how hard it's working: more
 * throttle is more grit and more of the exhaust's roar. `cut` drops it out
 * for a moment (the ignition cut of a gearshift).
 */
export interface EngineVoice {
  set(freq: number, gain: number, brightness: number): void;
  cut(seconds: number): void;
  /** Fade out and stop for good (the voice is done with: its view is closing). */
  stop(): void;
}

/** A filtered noise (tyres, rumble, rain); set its loudness every frame. */
export interface NoiseVoice {
  set(gain: number): void;
  stop(): void;
}

/** A tyre's squeal: a wavering tone over a hiss; set its loudness and how hard it's sliding (0…1) every frame. */
export interface SquealVoice {
  set(gain: number, slide: number): void;
  stop(): void;
}

const SILENT = { set() {}, cut() {}, stop() {} };

/** Fade `out` to silence, then stop `sources` and cut `out` loose (a voice done with). */
function retire(c: AudioContext, out: GainNode, sources: AudioScheduledSourceNode[]): void {
  const t = c.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setTargetAtTime(0, t, 0.02);
  for (const s of sources) {
    try {
      s.stop(t + 0.15);
    } catch {
      // already stopped
    }
  }
  setTimeout(() => out.disconnect(), 250);
}

/**
 * One turn of the crankshaft of a six-cylinder engine as a waveform: the
 * firing pulses (every third order of the crank's turn) strongest, the other
 * orders weaker, which gives the note its rasp. Played at a third of the
 * firing frequency.
 */
export const ENGINE_ORDERS = Array.from({ length: 36 }, (_, i) => {
  const k = i + 1;
  return (k % 3 === 0 ? 1 : k % 3 === 1 ? 0.3 : 0.18) / Math.pow(k, 0.75);
});

let engineWave: PeriodicWave | undefined;
let driveCurve: Float32Array<ArrayBuffer> | undefined;

/** A soft clip (tanh) for the engine's grit. */
function softClip(): Float32Array<ArrayBuffer> {
  if (!driveCurve) {
    driveCurve = new Float32Array(1024);
    for (let i = 0; i < driveCurve.length; i++) driveCurve[i] = Math.tanh((i / (driveCurve.length - 1)) * 4 - 2);
  }
  return driveCurve;
}

export function engineVoice(): EngineVoice {
  const c = audio();
  if (!c || !master || !noiseBuffer) return SILENT;
  engineWave ??= c.createPeriodicWave(new Float32Array([0, ...ENGINE_ORDERS]), new Float32Array(ENGINE_ORDERS.length + 1));
  // two cylinder banks, a touch out of tune with each other: the note beats and thickens
  const a = c.createOscillator();
  const b = c.createOscillator();
  a.setPeriodicWave(engineWave);
  b.setPeriodicWave(engineWave);
  const bGain = c.createGain();
  bGain.gain.value = 0.55;
  // a fast wobble in the pitch, so it never sounds like a test tone
  const jitter = c.createOscillator();
  jitter.type = 'triangle';
  jitter.frequency.value = 23;
  const jitterDepth = c.createGain();
  jitterDepth.gain.value = 6;
  jitter.connect(jitterDepth);
  jitterDepth.connect(a.detune);
  jitterDepth.connect(b.detune);
  // grit: driven harder into a soft clip on the throttle
  const drive = c.createGain();
  drive.gain.value = 1;
  const shaper = c.createWaveShaper();
  shaper.curve = softClip();
  shaper.oversample = '2x';
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  // the exhaust's breath: noise around the note's second harmonic
  const breath = c.createBufferSource();
  breath.buffer = noiseBuffer;
  breath.loop = true;
  const breathBand = c.createBiquadFilter();
  breathBand.type = 'bandpass';
  breathBand.Q.value = 1.5;
  const breathGain = c.createGain();
  breathGain.gain.value = 0;
  const out = c.createGain();
  out.gain.value = 0;
  const gate = c.createGain();
  a.connect(drive);
  b.connect(bGain).connect(drive);
  drive.connect(shaper).connect(filter).connect(out);
  breath.connect(breathBand).connect(breathGain).connect(out);
  out.connect(gate).connect(master);
  for (const o of [a, b, jitter]) o.start();
  breath.start(0, Math.random() * 2);
  return {
    set(freq, gain, brightness) {
      const t = c.currentTime;
      const crank = freq / 3;
      a.frequency.setTargetAtTime(crank, t, 0.025);
      b.frequency.setTargetAtTime(crank * 1.006, t, 0.025);
      drive.gain.setTargetAtTime(0.6 + brightness * 2.4, t, 0.05);
      filter.frequency.setTargetAtTime(Math.min(9000, freq * (2 + brightness * 7)), t, 0.04);
      breathBand.frequency.setTargetAtTime(freq * 2, t, 0.04);
      breathGain.gain.setTargetAtTime(0.25 + brightness * 0.9, t, 0.05);
      out.gain.setTargetAtTime(gain * 0.55, t, 0.05);
    },
    cut(seconds) {
      const t = c.currentTime;
      gate.gain.cancelScheduledValues(t);
      gate.gain.setValueAtTime(gate.gain.value, t);
      gate.gain.linearRampToValueAtTime(0.25, t + 0.012);
      gate.gain.setValueAtTime(0.25, t + seconds);
      gate.gain.linearRampToValueAtTime(1, t + seconds + 0.03);
    },
    stop: () => retire(c, out, [a, b, jitter, breath]),
  };
}

export function squealVoice(): SquealVoice {
  const c = audio();
  if (!c || !master || !noiseBuffer) return SILENT;
  const tone = c.createOscillator();
  tone.type = 'triangle';
  tone.frequency.value = 1050;
  // the rubber stick-slipping: a wobble in the pitch
  const wobble = c.createOscillator();
  wobble.frequency.value = 11;
  const wobbleDepth = c.createGain();
  wobbleDepth.gain.value = 70;
  wobble.connect(wobbleDepth).connect(tone.frequency);
  const toneGain = c.createGain();
  toneGain.gain.value = 0.5;
  const hiss = c.createBufferSource();
  hiss.buffer = noiseBuffer;
  hiss.loop = true;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2200;
  band.Q.value = 3;
  const out = c.createGain();
  out.gain.value = 0;
  tone.connect(toneGain).connect(out);
  hiss.connect(band).connect(out);
  out.connect(master);
  tone.start();
  wobble.start();
  hiss.start(0, Math.random() * 2);
  return {
    set(gain, slide) {
      const t = c.currentTime;
      tone.frequency.setTargetAtTime(900 + slide * 350, t, 0.08);
      out.gain.setTargetAtTime(gain, t, 0.04);
    },
    stop: () => retire(c, out, [tone, wobble, hiss]),
  };
}

/** An exhaust pop or a gearshift's crack: a very short burst of band-passed noise over a low click, `strength` 0…1. */
export function pop(strength: number, freq = 900): void {
  const c = audio();
  if (!c || !master || !noiseBuffer || c.state !== 'running' || strength <= 0) return;
  const t = c.currentTime;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.3 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  noise.connect(bp).connect(g).connect(master);
  noise.start(t, Math.random() * 1.9);
  noise.stop(t + 0.08);
  const click = c.createOscillator();
  click.frequency.setValueAtTime(180, t);
  click.frequency.exponentialRampToValueAtTime(60, t + 0.04);
  const cg = c.createGain();
  cg.gain.setValueAtTime(0.25 * strength, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  click.connect(cg).connect(master);
  click.start(t);
  click.stop(t + 0.07);
}

export function noiseVoice(type: BiquadFilterType, freq: number, q = 1): NoiseVoice {
  const c = audio();
  if (!c || !master || !noiseBuffer) return SILENT;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const out = c.createGain();
  out.gain.value = 0;
  src.connect(filter).connect(out).connect(master);
  src.start();
  return {
    set(gain) {
      out.gain.setTargetAtTime(gain, c.currentTime, 0.04);
    },
    stop: () => retire(c, out, [src]),
  };
}

/**
 * A burst of filtered noise: `seconds` long through a `type` filter at `freq` Hz, peaking at `gain` and fading
 * (a scrape, a radio's squelch, a crunch), after `delay` s.
 */
export function burst(type: BiquadFilterType, freq: number, q: number, seconds: number, gain: number, delay = 0): void {
  const c = audio();
  if (!c || !master || !noiseBuffer || c.state !== 'running' || gain <= 0) return;
  const t = c.currentTime + delay;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  noise.connect(f).connect(g).connect(master);
  noise.start(t, Math.random() * 1.5);
  noise.stop(t + seconds + 0.05);
}

/** A short tone: `freq` Hz for `seconds`, a quick attack and fade. */
export function beep(freq: number, seconds = 0.15, gain = 0.25, type: OscillatorType = 'square', delay = 0): void {
  const c = audio();
  if (!c || !master || c.state !== 'running') return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + seconds + 0.05);
}

/** A hit: a low thud falling in pitch under a burst of noise, `strength` 0…1. */
export function thump(strength: number): void {
  const c = audio();
  if (!c || !master || !noiseBuffer || c.state !== 'running' || strength <= 0) return;
  const s = Math.min(1, strength);
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0.6 * s, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.35);
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.35 * s, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + 0.2 * s);
  noise.connect(bp).connect(ng).connect(master);
  noise.start(t, Math.random());
  noise.stop(t + 0.5);
}
