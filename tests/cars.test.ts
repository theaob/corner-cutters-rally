import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CARS, carById, nextCar, unlockedCars } from '../src/f1/cars';
import { BODIES } from '../src/engine/render/carBodies';
import { createCarMesh } from '../src/engine/render/vehicles3d';
import { carClass } from '../src/engine/driving';

describe('the garage lineup', () => {
  it('has a body for every car, the first free and each next one dearer and quicker', () => {
    expect(CARS.map((c) => c.id).sort()).toEqual(Object.keys(BODIES).sort());
    expect(CARS[0].unlock).toBe(0);
    for (let i = 1; i < CARS.length; i++) {
      expect(CARS[i].unlock).toBeGreaterThan(CARS[i - 1].unlock);
      expect(CARS[i].speed).toBeGreaterThan(CARS[i - 1].speed);
    }
    // (today's car is the middle of the field: QUADRA's numbers)
    expect(carById('quadra')?.speed).toBe(1);
  });

  it('unlocks by career points', () => {
    expect(unlockedCars(0).map((c) => c.id)).toEqual(['mini']);
    expect(unlockedCars(110).map((c) => c.id)).toEqual(['mini', 'fulvia', 'alpine', 'brisk', 'stiletto']);
    expect(nextCar(110)?.id).toBe('quadra');
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
