import { beforeEach, describe, expect, it } from 'vitest';
import { REFERENCE, angleDiff, carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { Driver } from '../src/engine/drive/driver';
import { keysIntent } from '../src/engine/drive/keys';
import { DRIVE_DEFAULTS, driveSettings, savedDriveSettings, setDriveSetting } from '../src/engine/drive/settings';
import { useSave, type SaveStore } from '../src/engine/save';
import { useStore } from '../src/engine/storage';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { referenceStage } from '../src/f1/rally';
import { lineCornerSpeed, lineDecel, newProgress, stepProgress } from '../src/f1/racing';
import { CC_SAVE } from '../src/f1/save';
import { stageById } from '../src/f1/stages';
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

  it("gives TOP-DOWN a slower car that keeps more of its speed off the road, SIM the car as it was", () => {
    expect(rallyCar('sim')).toEqual(carClass('f1'));
    expect(rallyCar('topdown').topSpeed).toBeCloseTo(carClass('f1').topSpeed * TOP_DOWN.speed);
    expect(rallyCar('topdown').turnRate).toBe(carClass('f1').turnRate);
    expect(TOP_DOWN.zeroToTop).toBeGreaterThan(REFERENCE.zeroToTop);
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

/**
 * A player on the keys (the gas always on, CONTROL on WHEEL) driving `stageId` in TOP-DOWN: what they see is 0.15 s old, so they lead it
 * by that much; they steer at the road 0.4 s ahead, and brake for what the camera shows of it on a phone (style.ts:
 * topDownFraming, the way the car's going).
 */
function lateDriver(stageId: string) {
  const style = 'topdown';
  const cls = rallyCar(style);
  const H = styleHandling(handlingFor(NORMAL), style);
  const c = buildCircuit(stageById(stageId)!, { cornerSpeed: lineCornerSpeed(cls, H), decel: lineDecel(cls) });
  const { track, grid } = c;
  const n = track.samples.length;
  const reference = referenceStage(track, grid, H, 'dry', c.slots[0], cls).time;
  const LATE = 0.15;
  const lag = Math.round(LATE * 60);
  let held = new Set<string>();
  const driver = new Driver({ keys: () => keysIntent(held), pad: () => undefined }, () => ({ ...DRIVE_DEFAULTS, gas: 'auto', control: 'wheel' }));
  const car = newCar(cls, c.slots[0].x, c.slots[0].y, c.slots[0].heading);
  let p = newProgress(Math.round((track.stage!.start - 24) / track.spacing));
  const seenAt: { x: number; y: number; h: number; v: number; vx: number; vy: number; idx: number }[] = [];
  const brakeRate = cls.topSpeed / cls.brakeTime;
  let t = 0;
  for (; t < 200 && p.idx * track.spacing < track.stage!.finish && !car.wrecked; t += 1 / 60) {
    seenAt.push({ x: car.x, y: car.y, h: car.heading, v: speedOf(car), vx: car.vx, vy: car.vy, idx: p.idx });
    const now = seenAt[Math.max(0, seenAt.length - 1 - lag)];
    const before = seenAt[Math.max(0, seenAt.length - 7 - lag)];
    const o = {
      x: now.x + now.vx * LATE,
      y: now.y + now.vy * LATE,
      h: now.h + (angleDiff(now.h, before.h) / 0.1) * LATE,
      idx: Math.min(n - 1, now.idx + Math.round((now.v * LATE) / track.spacing)),
    };
    const aim = track.samples[Math.min(n - 1, o.idx + Math.round(Math.max(60, now.v * 0.4) / track.spacing))];
    const off = angleDiff(Math.atan2(aim.x - o.x, -(aim.y - o.y)), o.h);
    // (what the camera shows the way the car's going: at least the old fixed camera's 300 px across a phone)
    const wx = now.v > 30 ? now.vx : Math.sin(now.h);
    const wy = now.v > 30 ? now.vy : -Math.cos(now.h);
    const f = topDownFraming(wx, wy, PHONE, cls.topSpeed);
    const SEE = sightAhead(wx, wy, PHONE, f.zoom, f.lead * Math.min(1, now.v / cls.topSpeed));
    let want = Infinity;
    for (let k = 0; k * track.spacing <= SEE; k++) want = Math.min(want, Math.hypot(track.samples[Math.min(n - 1, o.idx + k)].speed, Math.sqrt(2 * brakeRate * 0.8 * k * track.spacing)));
    held = new Set([off < -0.05 && 'ArrowLeft', off > 0.05 && 'ArrowRight', now.v > want + 8 && 'ArrowDown'].filter((k): k is string => !!k));
    driver.sample();
    stepCar(car, driver.step(car, 1 / 60), H, 1 / 60, grid);
    p = stepProgress(p, track, car, t, 1, 1 / 60);
  }
  return { finished: p.idx * track.spacing >= track.stage!.finish, health: car.health / cls.health, time: t, reference };
}

describe('TOP-DOWN on a stage', () => {
  // Pine Ridge, and Castle Hill (two thirds of it across or down the screen)
  for (const id of ['ss-pine-ridge', 'ss-castle-hill']) {
    it(`${id}: can be driven to the finish unhurt, near the rivals, by a player who sees only what its camera shows and reacts late`, () => {
      const r = lateDriver(id);
      expect(r.finished).toBe(true);
      expect(r.health).toBeGreaterThan(0.9);
      // (NORMAL's rivals are about 9% off the reference)
      expect(r.time).toBeLessThan(r.reference * 1.3);
    }, 60_000);
  }
});
