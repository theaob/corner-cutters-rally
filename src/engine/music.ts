// Music: one track at a time, looping, with a crossfade when it changes. A
// track is a file (decoded whole, so it loops without a gap, from `loopStart`
// to `loopEnd` when it has an intro) or, until the composed one is dropped in,
// a placeholder synthesised on the device: a short loop rendered offline, its
// notes' tails folded back over the start so the loop is seamless. The music
// has its own volume (a setting, kept in the save) and plays through the same
// output as the sounds, so pausing and leaving the page silence it too.
// Without Web Audio it all does nothing.

import { audioOut } from './audio';
import { save, saved } from './save';

/** A placeholder: `seconds` of loop, built by scheduling notes on an offline context (tails may run past the end). */
export interface Placeholder {
  seconds: number;
  build(ctx: OfflineAudioContext): void;
}

export interface Track {
  id: string;
  /** the composed track: a file next to the page (e.g. 'music/race.m4a'); none yet, the placeholder plays */
  file?: string;
  /** seconds: where the loop starts and ends in the file (an intro before, an ending after); the whole file by default */
  loopStart?: number;
  loopEnd?: number;
  /** its loudness under the music volume, 0…1 (a race's under the engines, say) */
  gain?: number;
  placeholder?: Placeholder;
}

/** Seconds a change of track crossfades over. */
export const FADE = 1.2;
/** Extra seconds rendered after a placeholder's loop, for its notes' tails (folded back over the start). */
const TAIL = 2;

let volume: number | undefined;
let bus: GainNode | undefined;
let playing: { track: Track; source?: AudioBufferSourceNode; gain?: GainNode } | undefined;
/** the latest request: a slower load finishing after a newer one is dropped */
let wanted = 0;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

/** The music volume, 0…1 (0.7 unless the player changed it). */
export function musicVolume(): number {
  if (volume === undefined) {
    const v = saved('settings', 'music');
    volume = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
  }
  return volume;
}

/** Set the music volume (0…1), and remember it. */
export function setMusicVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  const o = audioOut();
  if (bus && o) bus.gain.setTargetAtTime(volume, o.ctx.currentTime, 0.05);
  save('settings', 'music', volume);
}

/**
 * Add the samples past `loop` back onto the start (per channel), so a loop's
 * notes ring on across the join instead of being cut off. Returns the first
 * `loop` samples.
 */
export function foldTail(data: Float32Array, loop: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(loop);
  out.set(data.subarray(0, loop));
  for (let i = loop; i < data.length; i++) out[(i - loop) % loop] += data[i];
  return out;
}

/** Render a placeholder into a seamless loop, peaking at 0.9. */
export async function renderPlaceholder(p: Placeholder, sampleRate: number): Promise<AudioBuffer> {
  const loop = Math.round(p.seconds * sampleRate);
  const Offline = globalThis.OfflineAudioContext ?? (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const off = new Offline(2, loop + TAIL * sampleRate, sampleRate);
  p.build(off);
  const rendered = await off.startRendering();
  const channels = [0, 1].map((ch) => foldTail(rendered.getChannelData(ch), loop));
  const peak = Math.max(1e-6, ...channels.map((d) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0)));
  const out = new AudioBuffer({ numberOfChannels: 2, length: loop, sampleRate });
  channels.forEach((d, ch) => {
    for (let i = 0; i < d.length; i++) d[i] *= 0.9 / peak;
    out.copyToChannel(d, ch);
  });
  return out;
}

/** A track's sound: its file decoded, or (no file, or it won't load) its placeholder rendered. Kept once made. */
function bufferFor(track: Track, ctx: AudioContext): Promise<AudioBuffer | undefined> {
  let b = buffers.get(track.id);
  if (!b) {
    b = (async () => {
      if (track.file) {
        try {
          const res = await fetch(track.file);
          if (res.ok) return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          // missing or undecodable: the placeholder, if there is one
        }
      }
      return track.placeholder ? renderPlaceholder(track.placeholder, ctx.sampleRate) : undefined;
    })().catch(() => undefined);
    buffers.set(track.id, b);
  }
  return b;
}

/** Fade out what's playing now, over `fade` s. */
function fadeOut(fade: number): void {
  const o = audioOut();
  if (!o || !playing?.gain || !playing.source) return;
  const t = o.ctx.currentTime;
  playing.gain.gain.cancelScheduledValues(t);
  playing.gain.gain.setValueAtTime(playing.gain.gain.value, t);
  playing.gain.gain.linearRampToValueAtTime(0, t + fade);
  playing.source.stop(t + fade + 0.05);
}

/** Play `track` (looping), crossfading over `fade` s from whatever is playing; the same track carries on. */
export function playMusic(track: Track, fade = FADE): void {
  if (playing?.track.id === track.id) return;
  const o = audioOut();
  if (!o) return;
  const { ctx, out } = o;
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = musicVolume();
    bus.connect(out);
  }
  fadeOut(fade);
  const request = ++wanted;
  playing = { track };
  void bufferFor(track, ctx).then((buffer) => {
    if (!buffer || request !== wanted || !bus) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = track.loopStart ?? 0;
    source.loopEnd = track.loopEnd ?? buffer.duration;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(track.gain ?? 1, t + fade);
    source.connect(gain).connect(bus);
    source.start(t);
    playing = { track, source, gain };
  });
}

/** Fade the music out over `fade` s. */
export function stopMusic(fade = FADE): void {
  wanted++;
  fadeOut(fade);
  playing = undefined;
}

/** The track playing (or loading), for tests and the debug hooks. */
export const musicPlaying = () => playing?.track.id;
