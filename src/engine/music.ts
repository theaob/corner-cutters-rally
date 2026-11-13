// Music: one track at a time, looping, with a crossfade when it changes. A
// track is a file (decoded whole, so it loops without a gap, from `loopStart`
// to `loopEnd` when it has an intro) or, until the composed one is dropped in,
// a placeholder synthesised on the device: a short loop rendered offline, its
// notes' tails folded back over the start so the loop is seamless. The music
// has its own volume (a setting, kept in the save) and plays through the same
// output as the sounds, so pausing and leaving the page silence it too.
// Without Web Audio it all does nothing.
//
// A composed track is streamed, not decoded whole: decoded, a second of it is
// 384 kB (48 kHz, stereo), so the theme's 158 s were 61 MB and the three files
// together 130 MB, kept for as long as the game was open. Streamed (an <audio>
// element played into the same output) it's the file and a few seconds of
// sound. It loops by handing over to a second element waiting at the loop's
// start: near seamless, not sample-exact. Where a track
// can't be streamed (no <audio>, or it won't play) it's decoded as before. And
// with MUSIC off in the settings nothing is read at all, until it's turned up.

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
/** the track wanted, and how to fade it out once it sounds (none while it loads, or while the music is off) */
let playing: { track: Track; stop?: (fade: number) => void } | undefined;
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

/** Set the music volume (0…1), and remember it. Off (0): what's playing stops and is let go; turned up again, it starts. */
export function setMusicVolume(v: number): void {
  const was = musicVolume();
  volume = Math.max(0, Math.min(1, v));
  save('settings', 'music', volume);
  const o = audioOut();
  if (!o) return;
  if (bus) bus.gain.setTargetAtTime(volume, o.ctx.currentTime, 0.05);
  if (volume === 0 && playing) {
    // (off: nothing sounding, nothing loading, nothing kept)
    wanted++;
    fadeOut(0.2);
    buffers.clear();
  } else if (was === 0 && volume > 0 && playing && !playing.stop) start(playing.track, FADE);
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
  playing?.stop?.(fade);
  if (playing) playing = { track: playing.track };
}

/** A gain to play into, fading in over `fade` s to the track's loudness; and its fade back out. */
function fader(ctx: AudioContext, track: Track, fade: number): { gain: GainNode; out(fade: number): void } {
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(track.gain ?? 1, t + fade);
  gain.connect(bus!);
  return {
    gain,
    out(over) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + over);
    },
  };
}

/** s before a track's loop end that the hand-over to its next time round is timed from */
const LOOP_WATCH = 0.6;

/**
 * Stream `track`'s file (<audio> elements into the music's output), looping; `failed` is called if it turns out
 * it can't be played (and nothing sounds). Gives back its fade-out, or undefined where there's no <audio> to stream with.
 *
 * Two elements take turns: while one plays, the other waits at the loop's start, read and ready, and starts as the
 * first reaches the loop's end (an element sent back to its own start goes quiet for a few tenths of a second
 * while it finds its place; one already there starts at once).
 */
function stream(track: Track, ctx: AudioContext, fade: number, failed: () => void): ((fade: number) => void) | undefined {
  if (!track.file || typeof Audio === 'undefined' || typeof ctx.createMediaElementSource !== 'function') return undefined;
  const from = track.loopStart ?? 0;
  const f = fader(ctx, track, fade);
  const els: HTMLAudioElement[] = [];
  const nodes: MediaElementAudioSourceNode[] = [];
  try {
    for (let k = 0; k < 2; k++) {
      const el = new Audio();
      el.preload = 'auto';
      el.src = track.file;
      // (from the loop's start the first time round too: what's before it is the file's lead-in)
      if (from > 0) el.currentTime = from;
      const node = ctx.createMediaElementSource(el);
      node.connect(f.gain);
      els.push(el);
      nodes.push(node);
    }
  } catch {
    f.gain.disconnect();
    return undefined;
  }
  /** the element playing, and the hand-over that's been timed */
  let now = 0;
  let over = false;
  let turn: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    if (over) return;
    over = true;
    clearTimeout(turn);
    ctx.removeEventListener('statechange', follow);
    for (const el of els) {
      el.pause();
      // (the file let go of: an element with a source keeps its download and its decoder)
      el.removeAttribute('src');
      el.load();
    }
    for (const node of nodes) node.disconnect();
    f.gain.disconnect();
  };
  const fail = () => {
    if (over) return;
    end();
    failed();
  };
  const play = (el: HTMLAudioElement) => void el.play().catch((e: unknown) => {
    // (not allowed yet, before the first tap, or paused again meanwhile: the next change of state tries again;
    // anything else, it can't be played)
    const name = (e as { name?: string } | undefined)?.name;
    if (name !== 'NotAllowedError' && name !== 'AbortError') fail();
  });
  // the sound's own clock stops with the game (a pause, the app put away: audio.ts); the element with it, so the
  // track carries on from where it was, as a decoded one does
  const follow = () => {
    if (over) return;
    if (ctx.state === 'running') play(els[now]);
    else els[now].pause();
  };
  /** The loop's end: the one waiting at its start plays, and the one that was playing goes back there to wait. */
  const handOver = () => {
    turn = undefined;
    if (over) return;
    const was = els[now];
    now = 1 - now;
    if (ctx.state === 'running') play(els[now]);
    was.pause();
    was.currentTime = from;
  };
  ctx.addEventListener('statechange', follow);
  els.forEach((el, k) => {
    el.addEventListener('error', fail);
    el.addEventListener('timeupdate', () => {
      if (over || k !== now || turn !== undefined) return;
      const left = (track.loopEnd ?? el.duration) - el.currentTime;
      if (left < LOOP_WATCH) turn = setTimeout(handOver, Math.max(0, left * 1000));
    });
    // (the file's end reached before the hand-over came: now)
    el.addEventListener('ended', () => {
      if (over || k !== now) return;
      clearTimeout(turn);
      handOver();
    });
  });
  follow();
  return (out) => {
    f.out(out);
    setTimeout(end, (out + 0.05) * 1000);
  };
}

/** Play `track` decoded whole (or its placeholder rendered): one with no file, or one that can't be streamed. */
function playDecoded(track: Track, ctx: AudioContext, fade: number, request: number): void {
  void bufferFor(track, ctx).then((buffer) => {
    if (!buffer || request !== wanted || !bus) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = track.loopStart ?? 0;
    source.loopEnd = track.loopEnd ?? buffer.duration;
    const f = fader(ctx, track, fade);
    source.connect(f.gain);
    source.start(ctx.currentTime);
    playing = {
      track,
      stop(out) {
        f.out(out);
        source.stop(ctx.currentTime + out + 0.05);
      },
    };
  });
}

/** Start `track`, fading in over `fade` s: streamed if it's a file that can be, else decoded. */
function start(track: Track, fade: number): void {
  const o = audioOut();
  if (!o) return;
  const { ctx, out } = o;
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = musicVolume();
    bus.connect(out);
  }
  const request = ++wanted;
  const stop = stream(track, ctx, fade, () => {
    // (it wouldn't stream after all: decoded, if it's still the one wanted)
    if (request !== wanted) return;
    playing = { track };
    playDecoded(track, ctx, fade, request);
  });
  if (stop) playing = { track, stop };
  else playDecoded(track, ctx, fade, request);
}

/** Play `track` (looping), crossfading over `fade` s from whatever is playing; the same track carries on. */
export function playMusic(track: Track, fade = FADE): void {
  if (playing?.track.id === track.id) return;
  if (!audioOut()) return;
  fadeOut(fade);
  playing = { track };
  // (MUSIC off: remembered, to start if it's turned up; nothing read or decoded for silence)
  if (musicVolume() === 0) {
    wanted++;
    buffers.clear();
    return;
  }
  start(track, fade);
}

/** Fade the music out over `fade` s. */
export function stopMusic(fade = FADE): void {
  wanted++;
  fadeOut(fade);
  playing = undefined;
}

/** The track playing (or loading, or waiting for the music to be turned up), for tests and the debug hooks. */
export const musicPlaying = () => playing?.track.id;

/** The tracks decoded and held in memory (a streamed one isn't), for tests and the debug hooks. */
export const musicHeld = (): string[] => [...buffers.keys()];
