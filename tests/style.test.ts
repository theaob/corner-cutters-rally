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
import { TOP_DOWN, bestKey, rallyCar, styleHandling } from '../src/f1/style';

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

describe('TOP-DOWN on a stage', () => {
  it('can be driven to the finish unhurt, near the rivals, by a player who sees only what its camera shows and reacts late', () => {
    // a player on the keys (the gas always on): what they see is 0.15 s old, so they lead it by that much; they steer
    // at the road 0.4 s ahead, and brake for what the camera shows of it (300 px ahead: the CLASSIC view, the road running across a phone)
    const style = 'topdown';
    const cls = rallyCar(style);
    const H = styleHandling(handlingFor(NORMAL), style);
    const c = buildCircuit(stageById('ss-pine-ridge')!, { cornerSpeed: lineCornerSpeed(cls, H), decel: lineDecel(cls) });
    const { track, grid } = c;
    const n = track.samples.length;
    const reference = referenceStage(track, grid, H, 'dry', c.slots[0], cls).time;
    const SEE = 300;
    const LATE = 0.15;
    const lag = Math.round(LATE * 60);
    let held = new Set<string>();
    const driver = new Driver({ keys: () => keysIntent(held), pad: () => undefined }, () => ({ ...DRIVE_DEFAULTS, gas: 'auto' }));
    const car = newCar(cls, c.slots[0].x, c.slots[0].y, c.slots[0].heading);
    let p = newProgress(Math.round((track.stage!.start - 24) / track.spacing));
    const seen: { x: number; y: number; h: number; v: number; vx: number; vy: number; idx: number }[] = [];
    const brakeRate = cls.topSpeed / cls.brakeTime;
    let t = 0;
    for (; t < 200 && p.idx * track.spacing < track.stage!.finish && !car.wrecked; t += 1 / 60) {
      seen.push({ x: car.x, y: car.y, h: car.heading, v: speedOf(car), vx: car.vx, vy: car.vy, idx: p.idx });
      const now = seen[Math.max(0, seen.length - 1 - lag)];
      const before = seen[Math.max(0, seen.length - 7 - lag)];
      const o = {
        x: now.x + now.vx * LATE,
        y: now.y + now.vy * LATE,
        h: now.h + (angleDiff(now.h, before.h) / 0.1) * LATE,
        idx: Math.min(n - 1, now.idx + Math.round((now.v * LATE) / track.spacing)),
      };
      const aim = track.samples[Math.min(n - 1, o.idx + Math.round(Math.max(60, now.v * 0.4) / track.spacing))];
      const off = angleDiff(Math.atan2(aim.x - o.x, -(aim.y - o.y)), o.h);
      let want = Infinity;
      for (let k = 0; k * track.spacing <= SEE; k++) want = Math.min(want, Math.hypot(track.samples[Math.min(n - 1, o.idx + k)].speed, Math.sqrt(2 * brakeRate * 0.8 * k * track.spacing)));
      held = new Set([off < -0.05 && 'ArrowLeft', off > 0.05 && 'ArrowRight', now.v > want + 8 && 'ArrowDown'].filter((k): k is string => !!k));
      driver.sample();
      stepCar(car, driver.step(car, 1 / 60), H, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 1, 1 / 60);
    }
    expect(p.idx * track.spacing).toBeGreaterThanOrEqual(track.stage!.finish);
    expect(car.health).toBeGreaterThan(cls.health * 0.9);
    // (NORMAL's rivals are about 9% off the reference)
    expect(t).toBeLessThan(reference * 1.3);
  }, 60_000);
});
