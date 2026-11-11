import { beforeEach, describe, expect, it } from 'vitest';
import { REFERENCE, carClass } from '../src/engine/driving';
import { driveSettings, savedDriveSettings, setDriveSetting } from '../src/engine/drive/settings';
import { useSave, type SaveStore } from '../src/engine/save';
import { useStore } from '../src/engine/storage';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { CC_SAVE } from '../src/f1/save';
import * as THREE from 'three';
import { HD2D_VIEW } from '../src/engine/look';
import { SIGHT, TOP_DOWN, bestKey, rallyCar, sightAhead, styleHandling, topDownFraming, type SightScreen } from '../src/f1/style';

const memory = (): SaveStore => {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
};

beforeEach(() => {
  useStore('cc:');
  useSave(CC_SAVE, memory());
});

describe('STYLE', () => {
  it('is TOP-DOWN to begin with, and TOP-DOWN drives with the gas always on whatever GAS says', () => {
    expect(driveSettings().style).toBe('topdown');
    setDriveSetting('gas', 'manual');
    expect(driveSettings().gas).toBe('auto');
    expect(savedDriveSettings().gas).toBe('manual');
  });

  it('SIM drives as the settings say', () => {
    setDriveSetting('style', 'sim');
    setDriveSetting('gas', 'manual');
    expect(driveSettings().gas).toBe('manual');
  });

  it("gives TOP-DOWN a car as quick as SIM's that keeps more of its speed off the road, SIM the car as it was", () => {
    expect(rallyCar('sim')).toEqual(carClass('f1'));
    expect(rallyCar('topdown').topSpeed).toBeCloseTo(carClass('f1').topSpeed * TOP_DOWN.speed);
    expect(TOP_DOWN.speed).toBe(1);
    expect(rallyCar('topdown').turnRate).toBe(carClass('f1').turnRate);
    expect(TOP_DOWN.zeroToTop).toBeLessThan(1.4);
    expect(TOP_DOWN.zeroToTop).toBeGreaterThanOrEqual(REFERENCE.zeroToTop * 0.9);
    expect(rallyCar('topdown').offRoad).toBeGreaterThan(carClass('f1').offRoad * 2);
  });

  it("softens TOP-DOWN's crashes and never rolls the car; leaves SIM's alone", () => {
    const h = handlingFor(NORMAL);
    expect(styleHandling(h, 'sim')).toBe(h);
    const soft = styleHandling(h, 'topdown');
    expect(soft.crashDamage).toBeLessThan(h.crashDamage);
    expect(soft.crashThreshold).toBeGreaterThan(h.crashThreshold);
    expect(soft.noRolls).toBe(true);
  });

  it("keeps TOP-DOWN's stage bests apart from SIM's", () => {
    expect(bestKey('ss-pine-ridge', 'sim')).toBe('ss-pine-ridge');
    expect(bestKey('ss-pine-ridge', 'topdown')).not.toBe('ss-pine-ridge');
  });
});

/** a phone (393 × 852, the review's): 195 game px across, 423 tall; the shortest the handheld screen gets; a desktop */
const PHONE: SightScreen = { width: 195, height: 423, desktop: false };
const SHORT: SightScreen = { width: 195, height: 216, desktop: false };
const DESKTOP: SightScreen = { width: 533, height: 300, desktop: true };
const PITCH = (HD2D_VIEW.pitch * Math.PI) / 180;
const TOP = rallyCar('topdown').topSpeed;

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
  const top = screen.desktop ? 0 : SIGHT.top;
  const bottom = screen.height - (screen.desktop ? 0 : SIGHT.thumbs * screen.height);
  const clear = (q: { x: number; y: number }) => q.x >= 0 && q.x <= screen.width && q.y >= top && q.y <= bottom;
  let ahead = 0;
  while (ahead < 2000 && clear(onScreen(ux * (ahead + 1), uy * (ahead + 1)))) ahead++;
  return { ahead, car: onScreen(0, 0), zoom, lead, top, bottom };
}

describe("TOP-DOWN's camera (P2: even sight)", () => {
  it('keeps the look it had with the road running up a phone', () => {
    const f = topDownFraming(0, -1, PHONE, TOP);
    expect(f.zoom).toBe(TOP_DOWN.zoom);
    // (aimed a touch less far ahead, to keep the car clear of the thumbs)
    expect(f.lead).toBeGreaterThan(TOP_DOWN.lead * 0.8);
    expect(f.lead).toBeLessThanOrEqual(TOP_DOWN.lead);
  });

  it(`shows ${SIGHT.seconds} s of road ahead at top speed whichever way it runs, with the car well on the screen`, () => {
    for (const screen of [PHONE, DESKTOP]) {
      for (let k = 0; k < 16; k++) {
        const way = (k / 16) * 2 * Math.PI;
        const s = seen(way, screen);
        expect(s.ahead, `way ${k}/16 on ${screen.width}×${screen.height}`).toBeGreaterThanOrEqual(SIGHT.seconds * TOP - 2);
        // (style.ts's own sums agree with the lens)
        expect(Math.abs(s.ahead - sightAhead(Math.sin(way), -Math.cos(way), screen, s.zoom, s.lead))).toBeLessThan(3);
        // the car clear of the edges, the top bar and the thumbs
        expect(s.car.x).toBeGreaterThan(12);
        expect(s.car.x).toBeLessThan(screen.width - 12);
        expect(s.car.y).toBeGreaterThan(s.top + 12);
        expect(s.car.y).toBeLessThan(s.bottom - 12);
      }
    }
  });

  it('pulls back no further than it must: across a phone, not past SIGHT.furthest', () => {
    const across = topDownFraming(1, 0, PHONE, TOP);
    expect(across.zoom).toBeLessThan(TOP_DOWN.zoom);
    expect(across.zoom).toBeGreaterThanOrEqual(SIGHT.furthest);
    // (on a desktop, wide, the road across has room at TOP_DOWN's own zoom)
    expect(topDownFraming(1, 0, DESKTOP, TOP).zoom).toBe(TOP_DOWN.zoom);
  });

  it('on the shortest phone screen still shows more ahead than the old fixed camera did, every way', () => {
    for (let k = 0; k < 16; k++) {
      const way = (k / 16) * 2 * Math.PI;
      const f = topDownFraming(Math.sin(way), -Math.cos(way), SHORT, TOP);
      const was = sightAhead(Math.sin(way), -Math.cos(way), SHORT, TOP_DOWN.zoom, TOP_DOWN.lead);
      expect(sightAhead(Math.sin(way), -Math.cos(way), SHORT, f.zoom, f.lead)).toBeGreaterThanOrEqual(was - 1);
    }
  });
});

// (TOP-DOWN on a stage: tests/point.test.ts, its players pointing with one thumb)
