// Turning pixel art into crisp textures.

import * as THREE from 'three';

/** Nearest-neighbour, no mipmaps: keeps pixel art crisp when magnified. */
export function pixelTexture(src: HTMLImageElement | HTMLCanvasElement): THREE.Texture {
  const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
