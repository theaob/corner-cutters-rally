import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bakeColours, mergedByMaterial } from '../src/engine/render/merge';
import { createCarMesh } from '../src/engine/render/vehicles3d';

/** draw calls a mesh takes: a group each, or one */
const callsOf = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.geometry.groups.length : 1);
const trianglesOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

describe('boxes merged by material', () => {
  const a = new THREE.MeshLambertMaterial();
  const b = new THREE.MeshLambertMaterial();
  const boxes = () => [
    { geometry: new THREE.BoxGeometry(1, 1, 1), faces: [a, a, b, a, a, a] },
    { geometry: new THREE.BoxGeometry(2, 1, 1).translate(5, 0, 0), faces: [b, b, b, a, b, b] },
  ];

  it('are a draw call a material, every face kept, each with the material it had', () => {
    const m = mergedByMaterial(boxes());
    expect(m.material).toEqual([a, b]);
    expect(callsOf(m)).toBe(2);
    expect(trianglesOf(m.geometry)).toBe(2 * 12);
    // (the first box's faces in a: five of them; the second's in a: one)
    const [ga, gb] = m.geometry.groups;
    expect(ga.count / 6).toBe(6);
    expect(gb.count / 6).toBe(6);
    // (and where they were: the second box still 5 along)
    m.geometry.computeBoundingBox();
    expect(m.geometry.boundingBox!.max.x).toBeCloseTo(6);
  });

  it('make a car a few draw calls, not one a face', () => {
    const car = createCarMesh('f1', { body: '#d8323c', stripe: '#f4f4f8' });
    let calls = 0;
    car.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) calls += callsOf(o as THREE.Mesh);
    });
    // (the body and nose a call a material, the helmet, and each wheel's tyre and band)
    expect(calls).toBeLessThan(25);
  });
});

const lambert = (color: number, more: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...more });

describe('baking a group of plain parts into one mesh', () => {
  it('makes its plain parts one mesh, each part where it was and in its own colour, the rest left as they are', () => {
    const group = new THREE.Group();
    group.position.set(100, 0, 0);
    const red = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), lambert(0xff0000));
    red.position.set(10, 0, 0);
    red.castShadow = true;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), lambert(0x0000ff));
    blue.position.set(0, 5, 0);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), lambert(0xffffff, { transparent: true, opacity: 0.5 }));
    group.add(red, blue, wake);

    expect(bakeColours(group)).toBe(2);
    // (the see-through wake, and the baked mesh)
    expect(group.children).toHaveLength(2);
    expect(group.children).toContain(wake);
    const baked = group.children.find((c) => c !== wake) as THREE.Mesh;
    expect(baked.castShadow).toBe(true);
    const pos = baked.geometry.getAttribute('position');
    const col = baked.geometry.getAttribute('color');
    expect(pos.count).toBe(72);
    // (in the group's own frame: the red box round x 10, the blue round y 5)
    const at = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const reds = [...Array(pos.count).keys()].filter((i) => col.getX(i) === 1 && col.getZ(i) === 0);
    const blues = [...Array(pos.count).keys()].filter((i) => col.getZ(i) === 1 && col.getX(i) === 0);
    expect(reds).toHaveLength(36);
    expect(blues).toHaveLength(36);
    for (const i of reds) expect(Math.abs(at(i).x - 10)).toBeLessThanOrEqual(1);
    for (const i of blues) expect(Math.abs(at(i).y - 5)).toBeLessThanOrEqual(1);
  });

  it('leaves a group alone when there is nothing to gain (fewer than two plain parts)', () => {
    const group = new THREE.Group();
    const one = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lambert(0x00ff00));
    const textured = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: new THREE.Texture() }));
    group.add(one, textured);
    expect(bakeColours(group)).toBe(0);
    expect(group.children).toEqual([one, textured]);
  });
});
