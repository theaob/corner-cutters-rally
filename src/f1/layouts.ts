// A road's layout: a centreline (control points from its start to its end), a
// scale, an elevation profile along it, and what it runs through; circuit.ts
// turns one into tiles, run-off and heights. The rallies' stages are grown from
// their seeds (stages.ts).

import type { Pt } from './racing';
import { stageById } from './stages';

export interface CircuitLayout {
  id: string;
  name: string;
  /** a line about it, for the rally's screen */
  about: string;
  /** centreline control points (px, before scaling), from the road's start to its end */
  points: Pt[];
  /** px per unit of `points` */
  scale: number;
  /** elevation (px) along the road, as [share of it, height] */
  elevation: [number, number][];
  /** in a forest: trees packed all round past the treeline, on a dark forest floor */
  forest?: boolean;
  /** in the desert: sand all round, past the treeline and on the run-off, camels wandering */
  desert?: boolean;
  /**
   * jumps: at `at` px along the road, a crest with a sharp lip the cars fly off (the ground rising `rise` px up a
   * run-up to it, and falling away beyond to land on: circuit.ts's JUMP); each on a straight, as no car steers in the air
   */
  jumps?: { at: number; rise: number }[];
  /** under snow (a winter's stage in the mountains): snow over the run-off and beyond, the spruces laden with it */
  snow?: boolean;
  /** on dirt: the road's surface loose earth (or packed snow, or sand), every car on off-road tyres (tyres.ts), sliding through the bends */
  dirt?: boolean;
  /** in the mountains: rock and alpine meadow past the treeline, snow up high, pines below the tree line and boulders */
  mountain?: boolean;
  /**
   * a rally's stage: a road with two ends (its points from one to the other, not round a loop), the start line `start`
   * px along it and the flying finish `finish` px along (the road runs on past it, to the stop at its end)
   */
  stage?: { start: number; finish: number };
}

/** The stage with this id, or undefined. */
export function layoutById(id: string | null | undefined): CircuitLayout | undefined {
  return stageById(id);
}
