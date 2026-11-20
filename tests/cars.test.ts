import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CARS, CLASSES, carById, carsIn, classById, classOf, nextCar, unlockedCars } from '../src/f1/cars';
import { rallyCar } from '../src/f1/style';
import { BODIES } from '../src/engine/render/carBodies';
import { createCarMesh } from '../src/engine/render/vehicles3d';
import { carClass } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { NORMAL, handlingFor } from '../src/f1/difficulty';
import { layoutById } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { referenceStage } from '../src/f1/rally';
import { styleHandling } from '../src/f1/style';

describe('the garage lineup', () => {
  it('has a body for every car, the first free and each next one dearer', () => {
    expect(CARS.map((c) => c.id).sort()).toEqual(Object.keys(BODIES).sort());
    expect(CARS[0].unlock).toBe(0);
    for (let i = 1; i < CARS.length; i++) expect(CARS[i].unlock).toBeGreaterThan(CARS[i - 1].unlock);
  });

  it("puts every car in a class, the classes a ladder: each quicker than the last, today's top class as the game drove before", () => {
    expect(CLASSES.map((c) => c.id)).toEqual(['historic', 'classic', 'groupb', 'groupa', 'wrc']);
    // (the cars in class order: a class's cars all unlock after the last class's)
    expect(CARS.map((c) => CLASSES.indexOf(classOf(c)))).toEqual([...CARS.map((c) => CLASSES.indexOf(classOf(c)))].sort((a, b) => a - b));
    for (const c of CLASSES) expect(carsIn(c.id).length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < CLASSES.length; i++) {
      expect(CLASSES[i].speed).toBeGreaterThan(CLASSES[i - 1].speed);
      expect(CLASSES[i].pickup).toBeLessThan(CLASSES[i - 1].pickup);
      expect(CLASSES[i].grip).toBeGreaterThan(CLASSES[i - 1].grip);
    }
    expect(classById('wrc')).toEqual({ id: 'wrc', name: 'WRC', speed: 1, pickup: 1, turn: 1, grip: 1, tough: 1 });
    expect(carsIn('wrc').map((c) => c.id)).toEqual(['leone', 'zefiro', 'apex']);
  });

  it("drives a car as its class does: a class's cars alike, a slower class slower", () => {
    expect(rallyCar(classOf(carById('mini')!))).toEqual(rallyCar(classOf(carById('alpine')!)));
    expect(rallyCar(classOf(carById('apex')!))).toEqual(rallyCar());
    const historic = rallyCar(classById('historic'));
    expect(historic.topSpeed).toBeCloseTo(rallyCar().topSpeed * 0.7);
    expect(historic.grip).toBeLessThan(rallyCar().grip);
    expect(historic.health).toBeLessThan(rallyCar().health);
  });

  it('runs a stage well slower in each class down the ladder: a historic car is far off a WRC car', () => {
    const layout = layoutById('ss-shakedown')!;
    const h = styleHandling(handlingFor(NORMAL));
    const times = CLASSES.map((k) => {
      const car = rallyCar(k);
      const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(car, h), decel: lineDecel(car) });
      return referenceStage(c.track, c.grid, h, 'dry', c.slots[0], car).time;
    });
    const wrc = times[times.length - 1];
    // (each class at least 4% off the next one up; the historic cars a good third slower than today's)
    for (let i = 1; i < times.length; i++) expect(times[i - 1]).toBeGreaterThan(times[i] * 1.04);
    expect(times[0]).toBeGreaterThan(wrc * 1.3);
  }, 60000);

  it('unlocks by career points', () => {
    expect(unlockedCars(0).map((c) => c.id)).toEqual(['mini']);
    expect(unlockedCars(110).map((c) => c.id)).toEqual(['mini', 'fulvia', 'alpine', 'brisk', 'stiletto']);
    expect(nextCar(110)?.id).toBe('volta');
    expect(nextCar(10_000)).toBeUndefined();
  });
});

describe('each car body', () => {
  const { width: W, length: L } = carClass('f1');
  for (const { id } of CARS) {
    it(`${id}: four wheels, a nose to tear off, about the car's size, a few draw calls`, () => {
      const car = createCarMesh('f1', { body: '#d8323c', stripe: '#f4f4f8', model: id }, true);
      expect(car.userData.parts.wheels).toHaveLength(4);
      expect(car.userData.parts.nose.children.length).toBeGreaterThan(0);
      // (its exhaust flame aside: it shows only in a pop)
      car.userData.flame.removeFromParent();
      const size = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(W + 3);
      expect(size.z).toBeLessThan(L + 2);
      expect(size.z).toBeGreaterThan(L * 0.75);
      let calls = 0;
      car.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && o.visible) calls += Array.isArray(m.material) ? m.geometry.groups.length : 1;
      });
      expect(calls).toBeLessThan(30);
    });
  }
});

describe('the rebuilt cars', () => {
  // (the cars rebuilt one by one after real ones; the rest are the first sketches, still to be replaced)
  for (const id of ['mini', 'fulvia', 'alpine', 'brisk', 'stiletto', 'volta', 'raia', 'saetta', 'quadra', 'kestrel', 'merlin', 'vortice', 'corsaro', 'typhoon', 'falco', 'leone', 'zefiro', 'apex'] as const) {
    it(`${id}: its gravel tyres stay inside its bodywork, seen from above`, () => {
      const car = createCarMesh('f1', { body: '#d8323c', stripe: '#f4f4f8', model: id }, true);
      const wheels = car.userData.parts.wheels as THREE.Group[];
      const tyres = wheels.map((w) => new THREE.Box3().setFromObject(w));
      for (const w of wheels) w.removeFromParent();
      const body = new THREE.Box3().setFromObject(car, true);
      for (const tyre of tyres) {
        expect(tyre.max.x).toBeLessThanOrEqual(body.max.x + 0.01);
        expect(tyre.min.x).toBeGreaterThanOrEqual(body.min.x - 0.01);
      }
    });
  }
});

describe('night floodlights', () => {
  /** the vertices in a car's meshes */
  const size = (floodlights: boolean) => {
    const car = createCarMesh('f1', { body: '#f3f2ec', model: 'kestrel', floodlights }, false);
    let n = 0;
    car.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) n += m.geometry.getAttribute('position').count;
    });
    return n;
  };
  it('a car carries its floodlights only when told to (a night or evening rally)', () => {
    expect(size(true)).toBeGreaterThan(size(false));
  });
});
