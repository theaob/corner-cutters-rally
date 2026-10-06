// The race's sounds: your engine (a V6's note that climbs through the gears,
// dropping a little at each upshift with the crack of the ignition cut, gritty
// on the throttle, popping on the overrun when you lift), the nearest rival's
// engine (quieter, louder as it closes, its pitch bent up as it comes and down
// as it goes), tyre squeal while sliding, a rumble on grass and gravel and a
// buzz over the kerbs and a crunch on the gravel, rain in the wet, a rush of air in another car's slipstream,
// the crowd in the grandstands (a murmur when you're near them, swelling into a
// cheer at the start, an overtake, a crash, the flag), the pit limiter's beep,
// and one-shots: hits and the scrape of metal, the start lights, the chequered
// flag, a lap record, and the team radio's squelch. The pitch and crowd models
// are pure and tested; the voices are engine/audio.ts.

import { beep, burst, engineVoice, noiseVoice, pop, squealVoice, thump } from '../engine/audio';

/** The gears an F1 car goes up through from a standstill to top speed. */
export const GEARS = 8;

/** Firing frequency (Hz) at idle, and at the rev limiter (a V6 at about 12,500 rpm). */
const IDLE_HZ = 210;
const LIMIT_HZ = 630;

/**
 * The engine note at `speed` (of `top`) and `throttle` (0…1): its pitch (the
 * firing frequency, Hz), loudness and brightness (0…1), and the gear. The revs
 * climb through each gear to the limiter; an upshift drops them back, a long
 * way in the low gears, less in the high ones (closer ratios).
 */
export function engineNote(speed: number, top: number, throttle: number): { freq: number; gain: number; brightness: number; gear: number } {
  const share = Math.max(0, Math.min(1, speed / top));
  if (speed < 3) return { freq: IDLE_HZ, gain: 0.05 + 0.04 * throttle, brightness: 0.1 + 0.3 * throttle, gear: 0 };
  const gear = Math.min(GEARS - 1, Math.floor(share * GEARS));
  // how far through this gear's range the revs are
  const within = Math.min(1, share * GEARS - gear);
  const from = 0.5 + (0.3 * gear) / (GEARS - 1);
  const rpm = from + (1 - from) * within;
  const freq = IDLE_HZ * 0.4 + rpm * (LIMIT_HZ - IDLE_HZ * 0.4);
  return { freq, gain: 0.06 + 0.08 * throttle + 0.04 * share, brightness: 0.2 + 0.8 * throttle * rpm, gear };
}

/** The pitch shift of a sound from a car closing at `closing` px/s (negative: going away), as a factor. */
export function doppler(closing: number): number {
  // (the speed of sound, scaled down to the game's so a pass is heard)
  return Math.max(0.82, Math.min(1.2, 1 / (1 - closing / 1100)));
}

/** The crowd: how loud its murmur and its cheer are, how far off it's heard, and how fast a cheer dies away. */
export const CROWD = {
  murmur: 0.03,
  cheer: 0.11,
  /** px from a grandstand's middle within which it's loudest, and beyond which it's quiet */
  close: 90,
  reach: 520,
  /** a cheer is heard this much even far from the stands (the whole circuit roars at the start) */
  everywhere: 0.3,
  /** cheer lost a second */
  fade: 0.4,
};

/** How near the crowd is (0…1) at (x, y): 1 by a grandstand, 0 out of earshot of them all. */
export function crowdNear(stands: { x: number; y: number }[], x: number, y: number): number {
  let near = 0;
  for (const st of stands) {
    const d = Math.hypot(st.x - x, st.y - y);
    near = Math.max(near, Math.min(1, Math.max(0, 1 - (d - CROWD.close) / (CROWD.reach - CROWD.close))));
  }
  return near;
}

/** The crowd's loudness: its murmur where you are, and a cheer (0…1) heard everywhere, loudest by the stands. */
export const crowdGain = (near: number, cheer: number): number => near * CROWD.murmur + cheer * CROWD.cheer * (CROWD.everywhere + (1 - CROWD.everywhere) * near);

/** The pit limiter's beep: every this many s while it's on. */
export const LIMITER_BEEP = 0.55;

export interface SoundFrame {
  dt: number;
  /** your car: speed and top speed (px/s), how fast it's sliding sideways (px/s), and what it's on */
  speed: number;
  top: number;
  slide: number;
  onRough: boolean;
  onKerb: boolean;
  /** the nearest other car: its speed and how far away it is (px); undefined for none */
  rival?: { speed: number; distance: number };
  /** how much you're in another car's slipstream, 0…1 (a rush of air) */
  tow?: number;
  /** on the gravel (a crunch, over the rough ground's rumble) */
  onGravel?: boolean;
  /** how near the grandstands are, 0…1 (crowdNear) */
  crowd?: number;
  /** the pit limiter is on (between the speed-limit lines) */
  limiter?: boolean;
}

export class RaceSounds {
  private readonly engine = engineVoice();
  private readonly rival = engineVoice();
  private readonly tyres = squealVoice();
  private readonly rumble = noiseVoice('lowpass', 160, 1);
  private readonly kerb = noiseVoice('bandpass', 650, 3);
  private readonly rain = noiseVoice('highpass', 3200, 0.7);
  private readonly wind = noiseVoice('bandpass', 1100, 0.9);
  private readonly gravel = noiseVoice('bandpass', 2400, 1.4);
  private readonly crowd = noiseVoice('bandpass', 800, 0.35);
  private readonly roar = noiseVoice('bandpass', 1700, 0.6);
  /** the crowd's cheer, 0…1, dying away */
  private cheering = 0;
  /** s to the pit limiter's next beep */
  private limiterIn = 0;
  private lastSpeed = 0;
  private throttle = 0;
  private gear = 0;
  /** seconds since you lifted off at high revs (the overrun pops), Infinity if you haven't */
  private lifted = Infinity;
  private rivalDistance?: number;
  private bend = 1;

  /** `rain`: how hard it's raining, 0…1 (a steady hiss). */
  constructor(rain: number) {
    this.setRain(rain);
  }

  /** The rain's hiss as hard as it's raining now, 0…1. */
  setRain(rain: number): void {
    this.rain.set(rain * 0.05);
  }

  update(f: SoundFrame): void {
    // on the throttle while the car is gaining speed, or flat out at the top (eased, so the note doesn't flutter)
    const gaining = f.dt > 0 && (f.speed > this.lastSpeed + 2 * f.dt || f.speed > f.top * 0.97) ? 1 : 0.2;
    const slowing = f.dt > 0 && f.speed < this.lastSpeed - 25 * f.dt;
    this.throttle += (gaining - this.throttle) * Math.min(1, f.dt * 8);
    this.lastSpeed = f.speed;
    const note = engineNote(f.speed, f.top, this.throttle);
    // an upshift: the ignition cut, and its crack
    if (note.gear > this.gear && this.throttle > 0.5) {
      this.engine.cut(0.045);
      pop(0.45, 1500);
    }
    this.gear = note.gear;
    // lifting at high revs: the exhaust pops and crackles for a moment
    if (slowing && this.throttle < 0.5 && note.freq > 420 && f.speed > 90) this.lifted = Math.min(this.lifted, 0);
    else if (!slowing) this.lifted = Infinity;
    if (this.lifted < 1.4) {
      this.lifted += f.dt;
      if (Math.random() < 9 * f.dt) pop(0.2 + Math.random() * 0.35, 500 + Math.random() * 700);
    }
    this.engine.set(note.freq, note.gain, note.brightness);
    if (f.rival) {
      const r = engineNote(f.rival.speed, f.top, 0.7);
      const near = Math.max(0, 1 - f.rival.distance / 260);
      // its pitch bent by how fast it's closing (a jump means a different car: no bend from that)
      const closing = this.rivalDistance !== undefined && f.dt > 0 ? (this.rivalDistance - f.rival.distance) / f.dt : 0;
      const bend = Math.abs(closing) < 600 ? doppler(closing) : this.bend;
      this.bend += (bend - this.bend) * Math.min(1, f.dt * 6);
      this.rivalDistance = f.rival.distance;
      this.rival.set(r.freq * 1.03 * this.bend, r.gain * 0.6 * near * near, r.brightness * 0.8);
    } else {
      this.rivalDistance = undefined;
      this.rival.set(IDLE_HZ, 0, 0);
    }
    const moving = Math.min(1, f.speed / 120);
    const slide = Math.min(1, Math.max(0, f.slide - 40) / 160);
    this.tyres.set(slide * 0.1, slide);
    this.rumble.set(f.onRough ? 0.25 * moving : 0);
    this.kerb.set(f.onKerb && !f.onRough ? 0.1 * moving : 0);
    this.wind.set((f.tow ?? 0) * 0.07);
    // the gravel's crunch: grainy, a stone at a time
    this.gravel.set(f.onGravel ? 0.12 * moving * (0.35 + 0.65 * Math.random()) : 0);
    // the crowd: a murmur by the stands, a cheer dying away
    this.cheering = Math.max(0, this.cheering - CROWD.fade * f.dt);
    const crowd = crowdGain(f.crowd ?? 0, this.cheering);
    this.crowd.set(crowd);
    this.roar.set(crowd * this.cheering * 0.8);
    // the pit limiter's beep
    if (f.limiter) {
      this.limiterIn -= f.dt;
      if (this.limiterIn <= 0) {
        beep(1450, 0.06, 0.07, 'square');
        this.limiterIn = LIMITER_BEEP;
      }
    } else this.limiterIn = 0;
  }

  /** The crowd cheers: `how` loud (0…1; a start, an overtake, a crash, the flag). */
  cheer(how: number): void {
    this.cheering = Math.min(1, this.cheering + how);
  }

  /** Metal on tarmac or on a wall, sparks flying: `strength` 0…1. */
  scrape(strength: number): void {
    const s = Math.min(1, strength);
    burst('highpass', 2600, 0.8, 0.12 + 0.2 * s, 0.12 * s);
    burst('bandpass', 4200, 2, 0.08 + 0.12 * s, 0.08 * s, 0.02);
  }

  /** The team radio keyed: a click and a burst of squelch (and again, softer, as it closes after `talk` s). */
  radio(talk = 1.6): void {
    beep(1900, 0.03, 0.08, 'square');
    burst('bandpass', 1800, 2.5, 0.16, 0.09);
    burst('bandpass', 1800, 2.5, 0.1, 0.05, talk);
    beep(1500, 0.03, 0.05, 'square', talk + 0.08);
  }

  /** Engine and ground to silence (e.g. your car is out of the race). */
  quiet(): void {
    this.engine.set(IDLE_HZ, 0, 0);
    this.rival.set(IDLE_HZ, 0, 0);
    this.tyres.set(0, 0);
    this.rumble.set(0);
    this.kerb.set(0);
    this.wind.set(0);
    this.gravel.set(0);
    this.crowd.set(0);
    this.roar.set(0);
  }

  /** Silence and stop every voice for good (the race view is closing). */
  dispose(): void {
    for (const v of [this.engine, this.rival, this.tyres, this.rumble, this.kerb, this.rain, this.wind, this.gravel, this.crowd, this.roar]) v.stop();
  }

  /** A hit: `strength` 0…1. */
  hit(strength: number): void {
    thump(strength);
  }

  /** One of the five start lights coming on. */
  light(): void {
    beep(520, 0.18, 0.2);
  }

  /** Lights out. */
  go(): void {
    beep(880, 0.45, 0.22);
  }

  /** Your chequered flag: a rising arpeggio. */
  flag(): void {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 0.18, 'triangle', i * 0.12));
  }

  /** Your last lap: two strikes of a bell. */
  finalLap(): void {
    for (const at of [0, 0.28]) {
      beep(1568, 0.5, 0.14, 'sine', at);
      beep(3136, 0.25, 0.05, 'sine', at);
    }
  }

  /** Your cut across a corner: a low double buzz, harsher when it's a penalty. */
  trackLimits(penalty: boolean): void {
    for (const at of [0, 0.16]) beep(penalty ? 147 : 196, 0.12, penalty ? 0.2 : 0.14, 'sawtooth', at);
  }

  /** A champagne cork: the pop, then the fizz. */
  cork(): void {
    pop(1, 700);
    burst('highpass', 3200, 0.7, 0.9, 0.06, 0.04);
  }

  /** A firework far off: a soft thud and a crackle. */
  firework(): void {
    pop(0.35, 240);
    burst('highpass', 2400, 0.9, 0.35, 0.03, 0.12);
  }

  /** A new lap record (or the race's fastest lap). */
  record(): void {
    beep(988, 0.12, 0.16, 'triangle');
    beep(1319, 0.25, 0.16, 'triangle', 0.1);
  }
}

/** A click for moving through a menu, and a brighter one for picking. */
export const menuTick = () => beep(660, 0.05, 0.08, 'square');
export const menuPick = () => beep(990, 0.09, 0.1, 'square');
