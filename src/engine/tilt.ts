// The phone's tilt, for steering by tilting it like a wheel (TILT in the settings). Held in portrait, rolling it left
// or right is the orientation's gamma (degrees, + with the right edge down), the same on Android and iOS. iOS asks the
// player first, and only on a tap: askTilt is called from one (the settings row, or a touch on the deck).

/** How the roll reads as steering: nothing within `dead` degrees of level, full lock at `full`. */
export const TILT = { dead: 3, full: 25 };

let gamma: number | undefined;
let listening = false;

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('deviceorientation', (e) => {
    gamma = typeof e.gamma === 'number' ? e.gamma : undefined;
  });
}

type AskingOrientation = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Start reading the tilt, asking first where the browser wants that (iOS: call it from a tap). True if it's allowed. */
export async function askTilt(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false;
  const ask = (DeviceOrientationEvent as unknown as AskingOrientation).requestPermission;
  if (typeof ask === 'function') {
    try {
      if ((await ask()) !== 'granted') return false;
    } catch {
      // (not from a tap, or refused: no tilt until it's asked again from one)
      return false;
    }
  }
  listen();
  return true;
}

/** The roll now (degrees), or undefined before the sensor has said anything (none, or not allowed yet). */
export const tiltNow = (): number | undefined => gamma;

/** The steering (−1 left … 1 right) for a roll of `deg` degrees. */
export function tiltTurn(deg: number | undefined, t = TILT): number {
  if (deg === undefined || Math.abs(deg) <= t.dead) return 0;
  return Math.sign(deg) * Math.min(1, (Math.abs(deg) - t.dead) / (t.full - t.dead));
}
