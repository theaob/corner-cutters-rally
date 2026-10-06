// A car's outline, drawn through whatever hides it: for a car under Suzuka's
// bridge, where the deck covers it from the camera. The car's edges as lines,
// drawn over everything, following the car; a part torn off it has none.

import * as THREE from 'three';

export interface CarOutline {
  group: THREE.Group;
  /** show it (over everything) or not, following `car` */
  update(car: THREE.Object3D, on: boolean): void;
}

/** The outline of `car` (as built: its parts where they sit on it), in `color`. */
export function carOutline(car: THREE.Object3D, color: THREE.ColorRepresentation): CarOutline {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  // (each mesh's edges, placed as the mesh sits on the car; its own, so its part can be torn off)
  car.updateMatrixWorld(true);
  const root = car.matrixWorld.clone().invert();
  const lines: { line: THREE.LineSegments; owner: THREE.Object3D }[] = [];
  car.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry, 30).applyMatrix4(root.clone().multiply(mesh.matrixWorld));
    const line = new THREE.LineSegments(edges, material);
    line.renderOrder = 10;
    group.add(line);
    lines.push({ line, owner: mesh });
  });
  group.visible = false;
  /** whether `o` shows on its car: it and every part it's on visible (not torn off) */
  const shown = (o: THREE.Object3D | null): boolean => {
    for (; o && o !== car; o = o.parent) if (!o.visible) return false;
    return true;
  };
  return {
    group,
    update(c, on) {
      group.visible = on && c.visible;
      if (!group.visible) return;
      group.position.copy(c.position);
      group.rotation.copy(c.rotation);
      for (const { line, owner } of lines) line.visible = shown(owner);
    },
  };
}
