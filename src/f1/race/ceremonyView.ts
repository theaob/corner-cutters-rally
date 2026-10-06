// The champagne ceremony in the race view: its set by the main straight (on a
// camera layer of its own, with the lights, so while it's on the camera sees
// nothing else and the circuit casts no shadow on it), the top three dressed
// in their cars and colours, and the name plates under their boards, placed
// on the screen each frame.

import * as THREE from 'three';
import type { Circuit } from '../circuit';
import { createCeremony, podiumSpot } from '../podium3d';
import { style } from './dom';

/** The set's camera layer (the circuit is on layer 0). */
const LAYER = 1;

/** A driver at the ceremony: their car's colours and model, their number and name, and whether it's you. */
export interface Podium {
  body: string;
  trim: string;
  car: THREE.Object3D;
  number?: number;
  name: string;
  you: boolean;
}

/** The ceremony for `circuit` (the wall naming `title`), in `scene`, seen by `camera`; its plates in `host`. */
export function createCeremonyView(circuit: Circuit, title: string, scene: THREE.Scene, camera: THREE.Camera) {
  const spot = podiumSpot(circuit);
  const ceremony = createCeremony(title);
  ceremony.group.position.set(spot.x, spot.h, spot.y);
  // (facing the camera's side, the south: the wall behind the cars)
  ceremony.group.rotation.y = 0;
  ceremony.group.visible = false;
  scene.add(ceremony.group);
  scene.traverse((o) => {
    if (o instanceof THREE.Light) o.layers.enable(LAYER);
  });
  // the name plates under the cars' boards: the place in gold, the number and the name (YOU in gold)
  const plates = [0, 1, 2].map(() => {
    const plate = document.createElement('div');
    style(plate, {
      position: 'absolute', transform: 'translate(-50%, 0)', padding: '3px 8px', borderRadius: '6px', background: 'rgba(21,20,31,.85)',
      color: '#f4f4f8', fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center', zIndex: '2', pointerEvents: 'none', display: 'none',
    });
    return plate;
  });
  let count = 0;
  return {
    ceremony,
    plates,
    /** Show the set alone (or the circuit again). */
    show(on: boolean) {
      ceremony.group.visible = on;
      if (camera.layers.isEnabled(LAYER) === on && camera.layers.isEnabled(0) === !on) return;
      camera.layers.set(on ? LAYER : 0);
      // (and the shadows: cast by the set alone)
      scene.traverse((o) => {
        if (o instanceof THREE.DirectionalLight) o.shadow.camera.layers.set(on ? LAYER : 0);
      });
    },
    /** Dress the top three (winner first). */
    setDrivers(top: Podium[]) {
      count = top.length;
      ceremony.setDrivers(top.map((d) => ({ body: d.body, trim: d.trim, helmet: d.you ? '#f2c14e' : '#f4f4f8', car: d.car })));
      ceremony.group.traverse((o) => o.layers.enable(LAYER));
      const gold = (text: string) => `<span style="color:#f2c14e">${text}</span>`;
      top.forEach((d, k) => (plates[k].innerHTML = `${gold(`P${k + 1}`)} ${d.number === undefined ? '' : `#${d.number} `}${d.you ? gold('YOU') : d.name}`));
    },
    /** Put the camera on the set at `t` s (the ceremony's own shot). */
    aim(t: number, cam: THREE.PerspectiveCamera) {
      const v = ceremony.view(t, cam.aspect, cam.fov);
      ceremony.group.localToWorld(v.eye);
      ceremony.group.localToWorld(v.at);
      cam.position.copy(v.eye);
      cam.lookAt(v.at);
      cam.updateMatrixWorld();
      return v.at;
    },
    /** The plates under the cars on a `width` × `height` screen (`shown`: else hidden; none out of the picture). */
    placePlates(shown: boolean, width: number, height: number) {
      plates.forEach((plate, k) => {
        const at = ceremony.group.localToWorld(ceremony.plate(k)).project(camera);
        // (not one out of the picture, as the camera holds on third)
        const show = shown && k < count && Math.abs(at.x) < 0.9 && Math.abs(at.y) < 0.9;
        plate.style.display = show ? 'block' : 'none';
        if (!show) return;
        plate.style.left = `${((at.x + 1) / 2) * width}px`;
        plate.style.top = `${((1 - at.y) / 2) * height}px`;
      });
    },
  };
}
