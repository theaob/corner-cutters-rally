import type { Controls } from './controls';
import type { Hud } from './deck';

/** Game-wide objects that live outside the renderer (DOM deck, input). */
export interface Services {
  controls: Controls;
  hud: Hud;
}
