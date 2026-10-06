// A copy of the 3D picture as it was last drawn, for a screenshot (the report's).
// A WebGL canvas can only be read in the same moment it's drawn (its buffer
// isn't kept, so as not to slow every frame), so a copy is asked for and made
// the next time a frame is drawn (frameDrawn, called by the HD-2D pipeline).

/** A frame's copy, and the canvas it was drawn on. */
export interface Frame {
  copy: HTMLCanvasElement;
  from: HTMLCanvasElement;
}

/** the copies waiting for the next frame */
let waiting: ((frame: Frame) => void)[] = [];

/** The next frame drawn, as a 2D canvas the size of the picture (and the canvas it's from); undefined if none is drawn within `timeout` ms. */
export function nextFrame(timeout = 1500): Promise<Frame | undefined> {
  return new Promise((resolve) => {
    const done = (frame?: Frame) => {
      clearTimeout(timer);
      waiting = waiting.filter((w) => w !== take);
      resolve(frame);
    };
    const take = (frame: Frame) => done(frame);
    const timer = setTimeout(() => done(undefined), timeout);
    waiting.push(take);
  });
}

/** Whether a copy is waiting for a frame (a view that's stopped drawing, paused, draws one for it). */
export const frameWanted = (): boolean => waiting.length > 0;

/** A frame has just been drawn on `canvas`: the copies asked for, made now while it can still be read. */
export function frameDrawn(canvas: HTMLCanvasElement): void {
  if (!waiting.length) return;
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d')?.drawImage(canvas, 0, 0);
  const list = waiting;
  waiting = [];
  for (const w of list) w({ copy, from: canvas });
}
