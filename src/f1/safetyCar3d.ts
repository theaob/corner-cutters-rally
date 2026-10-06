// The safety car in 3D: a low road car in silver with a green stripe, and an
// amber light bar that flashes while it leads the field.

import * as THREE from 'three';

export interface SafetyCarMesh {
  group: THREE.Group;
  /** flash the light bar */
  update(dt: number): void;
}

/** Facing north (−z), sized like the F1 car's body (w × l px) so it lines up with its physics. */
export function createSafetyCarMesh(w = 14, l = 28): SafetyCarMesh {
  const group = new THREE.Group();
  const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const silver = lambert('#c9ccd4');
  const stripe = lambert('#2f9a5a');
  const glass = lambert('#2e3b5c');
  const screen = lambert('#6d86b8');
  const dark = lambert('#111111');
  // BoxGeometry faces: +x, −x, +y, −y, +z (back), −z (front)
  const box = (bw: number, h: number, bl: number, y: number, z: number, faces: THREE.Material[]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bl), faces);
    m.position.set(0, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  box(w, 5, l, 4.5, 0, [silver, silver, silver, dark, silver, silver]); // body
  box(4, 0.4, l + 0.2, 7.1, 0, [stripe, stripe, stripe, dark, stripe, stripe]); // stripe over the top
  box(w - 3, 3.5, l * 0.42, 8.7, 2, [glass, glass, silver, dark, screen, screen]); // cabin
  // the light bar: two amber lamps that take turns
  const lamps = [-2.5, 2.5].map((x) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 2.4), mat);
    lamp.position.set(x, 11.2, 2);
    group.add(lamp);
    return mat;
  });
  const wheel = lambert('#151515');
  for (const z of [-(l / 2 - 5), l / 2 - 5]) {
    for (const x of [-w / 2, w / 2]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 2, 12), wheel);
      t.rotation.z = Math.PI / 2;
      t.position.set(x, 3, z);
      group.add(t);
    }
  }
  let time = 0;
  const on = new THREE.Color(3, 1.6, 0.2);
  const off = new THREE.Color(0.25, 0.14, 0.02);
  return {
    group,
    update(dt) {
      time += dt;
      const phase = Math.floor(time * 5) % 2 === 0;
      lamps[0].color.copy(phase ? on : off);
      lamps[1].color.copy(phase ? off : on);
    },
  };
}
