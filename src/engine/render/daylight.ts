// Sky light and a shadow-casting sun (or moon) for any 3D scene, such as
// the F1 circuit.

import * as THREE from 'three';

/** What the sky looks like at one moment. */
export interface SkyState {
  background: number;
  sky: number;
  ground: number;
  ambient: number;
  key: number;
  keyIntensity: number;
  /** where the key light sits relative to the focus (world px: x east, y up, z south) */
  keyOffset: { x: number; y: number; z: number };
  /** true while the key light is the moon */
  moon: boolean;
  lights: number;
}

export interface Daylight {
  sun: THREE.DirectionalLight;
  /** Keep the sun (and its shadow camera) centred on the action. */
  followSun(focus: THREE.Vector3): void;
  /** the sun's shadow map (px square); 0: no shadows */
  setShadowMapSize(size: number): void;
  /** Sky colour, ambient light and the sun (or moon) for a time of day. */
  setSky(sky: SkyState): void;
}

/** Sky light plus a warm shadow-casting sun, for any scene. Starts at noon. */
export function addDaylight(scene: THREE.Scene): Daylight {
  const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x5a4f48, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
  /** where the sun sits relative to the focus */
  const offset = new THREE.Vector3(140, 260, 170);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 1, far: 1200 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  return {
    sun,
    followSun: (focus) => {
      sun.position.set(focus.x + offset.x, offset.y, focus.z + offset.z);
      sun.target.position.copy(focus);
    },
    setSky: (sky) => {
      if (scene.background instanceof THREE.Color) scene.background.setHex(sky.background);
      hemi.color.setHex(sky.sky);
      hemi.groundColor.setHex(sky.ground);
      hemi.intensity = sky.ambient;
      sun.color.setHex(sky.key);
      sun.intensity = sky.keyIntensity;
      offset.set(sky.keyOffset.x, sky.keyOffset.y, sky.keyOffset.z);
    },
    setShadowMapSize: (size) => {
      // (0: no shadows; the materials made again for it, once)
      sun.castShadow = size > 0;
      if (size && sun.shadow.mapSize.x === size) return;
      if (size) sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
  };
}
