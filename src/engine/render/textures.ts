// Turning pixel art into crisp textures.

import * as THREE from 'three';
import { canvas } from './sprites';

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

/** Bands of colour, swirling when the texture scrolls: the Neon City's sphere, and the LED helmet. */
export function lightsTexture(): THREE.Texture {
  const [c, x] = canvas(64, 32);
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 32; j++) {
      const v = Math.sin(i * 0.3 + j * 0.45) + Math.sin(i * 0.12 - j * 0.2);
      const hue = (v * 60 + 280) % 360;
      x.fillStyle = `hsl(${hue}, 95%, ${55 + v * 8}%)`;
      x.fillRect(i, j, 1, 1);
    }
  }
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
