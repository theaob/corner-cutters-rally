// A race's strategy: which dry compound to run, how many stops, and when. Every
// plan with up to three stops (each stint on the SOFT or the HARD, each stop at
// the end of a lap) is timed from the tyre model (tyres.ts: the time a lap
// loses to the compound and to the wear, a set wearing faster on the SOFT) and
// what a stop costs (the stop and the pit lane), and the quickest come first.
// The AI drivers take one of the plans close to the quickest (each its own, so
// the field splits: some on a one-stop, some two, some starting on the HARD),
// stop on its laps and plan the rest again after each stop; the pit wall gives
// you the quickest, and you pick your tyres at a stop. In the wet or the damp
// the weather decides the tyres (tyres.ts), and the plan waits for the dry.
// Engine-free and unit-tested.

import { COMPOUNDS, DRY_COMPOUNDS, tyreSpeed, type DryCompound } from './tyres';

/** What a plan is made from. */
export interface StrategyInput {
  /** laps left to race (from now: the start, or the pit entry) */
  laps: number;
  /** a lap's time on new SOFTs (s) */
  lapTime: number;
  /** wear a lap on the SOFT (the HARD wears its share of it) */
  perLap: number;
  /** seconds a stop costs: the stop itself and the pit lane */
  stopCost: number;
  /** the set on now (mid-race: its compound and wear); none at the start, where the first stint's compound is free */
  current?: { compound: DryCompound; wear: number };
}

/** A stint: its compound and its laps (the last one's may be a part). */
export interface Stint {
  compound: DryCompound;
  laps: number;
}

/** A plan: its stints in order (a stop between each), and the seconds it loses to tyres and stops. */
export interface Plan {
  stints: Stint[];
  time: number;
}

/** The most stops a plan has. */
export const MAX_STOPS = 3;
/** Laps past which a race is planned with no stops (a session run lap after lap, like qualifying: nothing to plan). */
export const MAX_PLAN_LAPS = 40;

/** The share of the SOFT's wear `c` does in the dry. */
const wearShare = (c: DryCompound) => COMPOUNDS[c].on.dry.wear / COMPOUNDS.slick.on.dry.wear;

/** Seconds a stint of `laps` loses on `c` (from new, or `wear` on), at `perLap` SOFT wear a lap. */
export function stintTime(c: DryCompound, laps: number, wear: number, perLap: number, lapTime: number): number {
  const speed = COMPOUNDS[c].on.dry.speed;
  const rate = perLap * wearShare(c);
  let loss = 0;
  for (let i = 0; i < laps; i++) {
    const part = Math.min(1, laps - i);
    const w = Math.min(1, wear + rate * (i + part / 2));
    loss += lapTime * (1 / (tyreSpeed(w) * speed) - 1) * part;
  }
  return loss;
}

/** Every plan with up to MAX_STOPS stops, the quickest first. */
export function plans(input: StrategyInput): Plan[] {
  const { laps, lapTime, perLap, stopCost, current } = input;
  const out: Plan[] = [];
  const whole = Math.floor(laps);
  const time = (stints: Stint[]) =>
    stints.reduce((t, s, k) => t + stintTime(s.compound, s.laps, k === 0 && current ? current.wear : 0, perLap, lapTime), 0) + (stints.length - 1) * stopCost;
  const firsts: DryCompound[] = current ? [current.compound] : DRY_COMPOUNDS;
  // (stop points: the stints' lengths, each a whole number of laps but the last, which takes what's left)
  const splits = (n: number): number[][] => {
    if (n === 1) return [[laps]];
    const res: number[][] = [];
    const go = (left: number, parts: number[]) => {
      if (parts.length === n - 1) {
        if (left > 0) res.push([...parts, left]);
        return;
      }
      for (let k = 1; k <= Math.floor(left) - (n - 1 - parts.length); k++) go(left - k, [...parts, k]);
    };
    go(laps, []);
    return res;
  };
  const most = laps > MAX_PLAN_LAPS ? 1 : MAX_STOPS + 1;
  for (let n = 1; n <= most && n <= Math.max(1, whole); n++) {
    for (const lengths of splits(n)) {
      // (each stint's compound: the first as it must be, the rest either)
      const combos: DryCompound[][] = [[]];
      for (let k = 0; k < n; k++) {
        const choices = k === 0 ? firsts : DRY_COMPOUNDS;
        combos.splice(0, combos.length, ...combos.flatMap((c) => choices.map((x) => [...c, x])));
      }
      for (const cs of combos) {
        const stints = lengths.map((l, k) => ({ compound: cs[k], laps: l }));
        out.push({ stints, time: time(stints) });
      }
    }
  }
  // (a tie: the later stops first, a set run longer while the race's young and the last stint short, so a set wearing
  // more than planned goes over its cliff on the in-lap, not with laps to go)
  const later = (a: Plan, b: Plan) => {
    for (let k = 0; k < Math.min(a.stints.length, b.stints.length); k++) if (a.stints[k].laps !== b.stints[k].laps) return b.stints[k].laps - a.stints[k].laps;
    return 0;
  };
  return out.sort((a, b) => (Math.abs(a.time - b.time) > 1e-6 ? a.time - b.time : later(a, b)));
}

/** The quickest plan. */
export const bestPlan = (input: StrategyInput): Plan => plans(input)[0];

/** s (or this share of the race, if more) behind the quickest a plan can be and still be one a driver might take */
export const STRATEGY_SPREAD = { seconds: 2.5, share: 0.006 };

/**
 * The plans a driver might take: the quickest of each kind (by stops and starting compound) within the spread of
 * the quickest of all, the quickest first. A field picks among them, so it doesn't all run the same race.
 */
export function choices(input: StrategyInput): Plan[] {
  const all = plans(input);
  const best = all[0].time;
  const within = Math.max(STRATEGY_SPREAD.seconds, STRATEGY_SPREAD.share * input.lapTime * input.laps);
  const seen = new Set<string>();
  const out: Plan[] = [];
  for (const p of all) {
    if (p.time - best > within) break;
    const kind = `${p.stints.length}:${p.stints[0].compound}`;
    if (seen.has(kind)) continue;
    seen.add(kind);
    out.push(p);
  }
  return out;
}

/** Driver `k`'s pick among `options` (the quickest first): most take the quickest, the rest spread over the others. */
export function pickFor(options: Plan[], k: number): Plan {
  if (options.length === 1) return options[0];
  // (half the field on the quickest, the other half shared among the rest, by the driver's number)
  const h = (k * 2654435761) >>> 0;
  return h % 2 === 0 ? options[0] : options[1 + ((h >>> 1) % (options.length - 1))];
}

/** How a plan reads on the screen: SFT → HRD, 1 STOP (or NO STOP). */
export function planText(p: Plan): string {
  const stops = p.stints.length - 1;
  return `${p.stints.map((s) => COMPOUNDS[s.compound].short).join(' → ')} · ${stops ? `${stops} STOP${stops > 1 ? 'S' : ''}` : 'NO STOP'}`;
}
