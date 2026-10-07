// VIEW in the settings: the camera on a stage, remembered, and changed mid-stage too (the deck's camera button, or C
// on the keys). `?cam=` in the address still picks one to try out, until the view is changed in the game.

import { save, saved } from '../engine/save';

export type ViewId = 'chase' | 'road' | 'heading' | 'bonnet' | 'classic' | 'iso';
/** The views, in the order the camera button goes through them. */
export const VIEWS: ViewId[] = ['chase', 'road', 'heading', 'bonnet', 'classic', 'iso'];

/** What each view is, in a few words (the settings row's line under it). */
export const VIEW_ABOUT: Record<ViewId, string> = {
  chase: 'low, behind the car',
  road: 'high, turns with the road',
  heading: 'high, turns with the car',
  bonnet: 'on the bonnet',
  classic: 'high, north always up',
  iso: 'a fixed diagonal',
};

export const isView = (v: unknown): v is ViewId => VIEWS.includes(v as ViewId);

let view: ViewId | undefined;
/** The view (CHASE unless another was picked). */
export function viewSetting(): ViewId {
  if (!view) {
    const v = saved('settings', 'view');
    view = isView(v) ? v : 'chase';
  }
  return view;
}
export function setView(v: ViewId): void {
  view = v;
  save('settings', 'view', v);
}

/** The view after `v`, round to the first. */
export const nextView = (v: ViewId): ViewId => VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length];

/** Forget what was read from the save (tests). */
export function resetView(): void {
  view = undefined;
}
