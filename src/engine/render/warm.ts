import * as THREE from 'three';

/**
 * Draw a scene once with everything in it shown and nothing culled, then put it all back as it was. A normal first
 * draw only compiles the shaders and sends the meshes and textures to the graphics chip for what's in view, so the
 * rest (the pit lane and stands off to the side, the chequered flag, the champagne ceremony, the safety car, the
 * ghost, the fireworks) did that the first time it came into sight, a hitch mid-race. `extras` are things out of
 * the scene for now (the safety car) that are put in for the draw.
 */
export function drawWhole(scene: THREE.Scene, draw: () => void, extras: THREE.Object3D[] = []): void {
  const saved: [THREE.Object3D, boolean, boolean][] = [];
  scene.traverse((o) => {
    saved.push([o, o.visible, o.frustumCulled]);
    o.visible = true;
    o.frustumCulled = false;
  });
  const added = extras.filter((o) => !o.parent);
  for (const o of added) scene.add(o);
  try {
    draw();
  } finally {
    for (const o of added) scene.remove(o);
    for (const [o, visible, culled] of saved) {
      o.visible = visible;
      o.frustumCulled = culled;
    }
  }
}
