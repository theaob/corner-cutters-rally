import { beforeEach, describe, expect, it } from 'vitest';
import { REFERENCE, carClass } from '../src/engine/driving';
import { useSave, type SaveStore } from '../src/engine/save';
import { useStore } from '../src/engine/storage';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { CC_SAVE } from '../src/f1/save';
import * as THREE from 'three';
import { HD2D_VIEW } from '../src/engine/look';
import { CAMERA_NEAR, CAR_SPOT, SIGHT, TOP_DOWN, carSpot, easeSpot, groundAt, onScreen, stageFraming, bestKey, rallyCar, sightAhead, styleHandling, topDownFraming, type SightScreen } from '../src/f1/style';

const memory = (): SaveStore => {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
};

beforeEach(() => {
  useStore('cc:');
  useSave(CC_SAVE, memory());
});

describe('the stage car', () => {
  it("is as quick as the reference car, quicker off the line, and keeps more of its speed off the road", () => {
    expect(rallyCar().topSpeed).toBeCloseTo(carClass('f1').topSpeed * TOP_DOWN.speed);
    expect(TOP_DOWN.speed).toBe(1);
    expect(rallyCar().turnRate).toBe(carClass('f1').turnRate);
    expect(TOP_DOWN.zeroToTop).toBeLessThan(1.4);
    expect(TOP_DOWN.zeroToTop).toBeGreaterThanOrEqual(REFERENCE.zeroToTop * 0.9);
    expect(rallyCar().offRoad).toBeGreaterThan(carClass('f1').offRoad * 2);
  });

  it('crashes softly and never rolls', () => {
    const h = handlingFor(NORMAL);
    const soft = styleHandling(h);
    expect(soft.crashDamage).toBeLessThan(h.crashDamage);
    expect(soft.crashThreshold).toBeGreaterThan(h.crashThreshold);
    expect(soft.noRolls).toBe(true);
  });

  it('keeps stage bests under the key they were saved with before', () => {
    expect(bestKey('ss-pine-ridge')).toBe('ss-pine-ridge@topdown');
  });
});

/** landscape screens, 300 game px tall: the narrowest the game draws (a 16:9 window) up to a 22:9 phone */
const NARROW: SightScreen = { width: 533, height: 300 };
const PHONE: SightScreen = { width: 733, height: 300 };
const PITCH = (HD2D_VIEW.pitch * Math.PI) / 180;
const TOP = rallyCar().topSpeed;

/**
 * px of road in sight ahead of a car going `way` (radians, 0 north) at top speed, through the camera as the stage sets it
 * up (race.ts: CLASSIC, north up), and where the car is on the screen (game px, y down)
 */
function seen(way: number, screen: SightScreen) {
  const ux = Math.sin(way);
  const uy = -Math.cos(way);
  const { zoom, lead } = topDownFraming(ux, uy, screen, TOP);
  const camera = new THREE.PerspectiveCamera(HD2D_VIEW.fov, screen.width / screen.height, 1, 4000);
  camera.up.set(0, 0, -1);
  const dist = screen.height / (2 * Math.tan((HD2D_VIEW.fov / 2) * (Math.PI / 180))) / zoom;
  const focus = new THREE.Vector3(ux * lead, 0, uy * lead);
  camera.position.set(focus.x, Math.sin(PITCH) * dist, focus.z + Math.cos(PITCH) * dist);
  camera.lookAt(focus);
  camera.updateMatrixWorld();
  const onScreen = (x: number, y: number) => {
    const v = new THREE.Vector3(x, 0, y).project(camera);
    return { x: ((v.x + 1) / 2) * screen.width, y: ((1 - v.y) / 2) * screen.height };
  };
  const top = 0;
  const bottom = screen.height;
  const clear = (q: { x: number; y: number }) => q.x >= 0 && q.x <= screen.width && q.y >= top && q.y <= bottom;
  let ahead = 0;
  while (ahead < 2000 && clear(onScreen(ux * (ahead + 1), uy * (ahead + 1)))) ahead++;
  return { ahead, car: onScreen(0, 0), zoom, lead, top, bottom };
}

describe("TOP-DOWN's camera (P2: even sight)", () => {
  it(`shows ${SIGHT.seconds} s of road ahead at top speed whichever way it runs, with the car well on the screen`, () => {
    for (const screen of [NARROW, PHONE]) {
      for (let k = 0; k < 16; k++) {
        const way = (k / 16) * 2 * Math.PI;
        const s = seen(way, screen);
        expect(s.ahead, `way ${k}/16 on ${screen.width}×${screen.height}`).toBeGreaterThanOrEqual(SIGHT.seconds * TOP - 2);
        // (style.ts's own sums agree with the lens)
        expect(Math.abs(s.ahead - sightAhead(Math.sin(way), -Math.cos(way), screen, s.zoom, s.lead))).toBeLessThan(3);
        // the car clear of the edges
        expect(s.car.x).toBeGreaterThan(12);
        expect(s.car.x).toBeLessThan(screen.width - 12);
        expect(s.car.y).toBeGreaterThan(s.top + 12);
        expect(s.car.y).toBeLessThan(s.bottom - 12);
      }
    }
  });

  it('across a wide screen, the road has room at its own zoom; up the short side it pulls back, no further than SIGHT.furthest', () => {
    expect(topDownFraming(1, 0, PHONE, TOP).zoom).toBe(TOP_DOWN.zoom);
    const up = topDownFraming(0, -1, PHONE, TOP);
    expect(up.zoom).toBeLessThanOrEqual(TOP_DOWN.zoom);
    expect(up.zoom).toBeGreaterThanOrEqual(SIGHT.furthest);
  });

  it('only the zoom follows the way the car goes (CAMERA_NEAR closer than the framing)', () => {
    for (const screen of [NARROW, PHONE]) {
      for (let k = 0; k < 16; k++) {
        const ux = Math.sin((k / 16) * 2 * Math.PI);
        const uy = -Math.cos((k / 16) * 2 * Math.PI);
        expect(stageFraming(ux, uy, screen, TOP).zoom).toBeCloseTo(topDownFraming(ux, uy, screen, TOP).zoom * CAMERA_NEAR);
      }
    }
  });

  it('holds the car at its spot: the camera aimed short of it by groundAt puts it there, at any zoom', () => {
    for (const screen of [NARROW, PHONE]) {
      for (const spot of [carSpot(0, -1), carSpot(1, 0), carSpot(-1, 1)]) {
        for (const zoom of [0.4, 0.74, 1.2]) {
          const g = groundAt(spot, screen, zoom);
          const q = onScreen(g.x, g.y, screen, zoom);
          expect(q.x / screen.width + 0.5).toBeCloseTo(spot.x, 6);
          expect(q.y / screen.height + 0.5).toBeCloseTo(spot.y, 6);
        }
      }
      expect(groundAt({ x: 0.5, y: 0.5 }, screen, 0.7)).toEqual({ x: 0, y: 0 });
    }
  });

  it('puts the car on the side the road is not going to, and never above the middle of the screen', () => {
    // (the road ahead bending left: the car over on the right; bending right: on the left)
    expect(carSpot(-1, -1).x).toBeGreaterThan(0.6);
    expect(carSpot(1, -1).x).toBeLessThan(0.4);
    expect(carSpot(-1, 0).x).toBeCloseTo(CAR_SPOT.x.most);
    expect(carSpot(1, 0).x).toBeCloseTo(CAR_SPOT.x.least);
    // (straight up the screen: the middle across, low)
    expect(carSpot(0, -1)).toEqual({ x: 0.5, y: CAR_SPOT.y.most });
    for (let k = 0; k < 32; k++) {
      const s = carSpot(Math.sin((k / 32) * 2 * Math.PI), -Math.cos((k / 32) * 2 * Math.PI));
      expect(s.y, `way ${k}/32`).toBeGreaterThanOrEqual(0.5);
      expect(s.x).toBeGreaterThanOrEqual(CAR_SPOT.x.least - 1e-9);
      expect(s.x).toBeLessThanOrEqual(CAR_SPOT.x.most + 1e-9);
    }
    // (down the screen: up to the middle, no further)
    expect(carSpot(0, 1).y).toBe(0.5);
  });

  it('eases over to a new spot slowly, never past it', () => {
    let s = { x: 0.24, y: 0.74 };
    const want = { x: 0.76, y: 0.5 };
    s = easeSpot(s, want, 1 / 60);
    expect(s.x - 0.24).toBeLessThan(0.01);
    for (let i = 0; i < 60 * CAR_SPOT.ease; i++) s = easeSpot(s, want, 1 / 60);
    // (about two thirds of the way in CAR_SPOT.ease s)
    expect(s.x).toBeGreaterThan(0.55);
    expect(s.x).toBeLessThan(0.65);
    for (let i = 0; i < 600; i++) s = easeSpot(s, want, 1 / 60);
    expect(s.x).toBeLessThanOrEqual(0.76);
    expect(s.x).toBeCloseTo(0.76, 2);
  });

  it('shows over 0.4 s of road ahead at top speed every way from its spot, and over 1.2 s driving up the screen', () => {
    const sight = (ux: number, uy: number, screen: SightScreen) => {
      const zoom = stageFraming(ux, uy, screen, TOP).zoom;
      const g = groundAt(carSpot(ux, uy), screen, zoom);
      let t = 0;
      while (t < 3000) {
        const q = onScreen(g.x + ux * t, g.y + uy * t, screen, zoom);
        if (Math.abs(q.x) > screen.width / 2 || Math.abs(q.y) > screen.height / 2) break;
        t++;
      }
      return t / TOP;
    };
    for (const screen of [NARROW, PHONE]) {
      for (let k = 0; k < 16; k++) expect(sight(Math.sin((k / 16) * 2 * Math.PI), -Math.cos((k / 16) * 2 * Math.PI), screen), `way ${k}/16`).toBeGreaterThan(0.4);
      expect(sight(0, -1, screen)).toBeGreaterThan(1.2);
    }
  });
});

// (TOP-DOWN on a stage: tests/point.test.ts, its players pointing with one thumb)
