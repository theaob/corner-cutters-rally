// The chequered flag at the finish line: a pole on the pit wall with a flag
// that flies out over the track and waves (a ripple running along the cloth,
// growing toward its free end). Out once the winner has crossed the line.

import * as THREE from 'three';

export interface ChequeredFlag {
  group: THREE.Group;
  /** Wave the cloth: `t` seconds of time. */
  update(t: number): void;
}

/** px: the pole's height, and the flag's size */
const POLE = 54;
const W = 42;
const H = 27;

/** A chequered flag on a pole, the cloth flying toward local +x (the pole at the origin, standing up +y). */
export function createChequeredFlag(): ChequeredFlag {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, POLE, 6), new THREE.MeshLambertMaterial({ color: 0xc9ccd4 }));
  pole.position.y = POLE / 2;
  pole.castShadow = true;
  // the cloth: 8 × 5 black and white squares, crisp at any size
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 40;
  const x = canvas.getContext('2d')!;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
    x.fillStyle = (i + j) % 2 ? '#15141f' : '#f4f4f8';
    x.fillRect(i * 8, j * 8, 8, 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.PlaneGeometry(W, H, 16, 2);
  cloth.translate(W / 2, 0, 0);
  const rest = Float32Array.from(cloth.attributes.position.array);
  const flag = new THREE.Mesh(cloth, new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }));
  flag.position.y = POLE - H / 2;
  flag.castShadow = true;
  group.add(pole, flag);
  return {
    group,
    update(t) {
      const pos = cloth.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = rest[i * 3];
        const along = px / W;
        // a ripple running out along the cloth, more at the free end; the end droops a touch
        pos.setZ(i, Math.sin(px * 0.22 - t * 9) * 3.6 * along + Math.sin(px * 0.08 - t * 4) * 1.6 * along);
        pos.setY(i, rest[i * 3 + 1] - along * along * 1.5);
      }
      pos.needsUpdate = true;
      cloth.computeVertexNormals();
    },
  };
}
