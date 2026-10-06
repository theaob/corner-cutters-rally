import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCircuit } from '../src/f1/circuit';
import { CRESCENT_PARK, ROYAL_PARK } from '../src/f1/layouts';
import { carClass } from '../src/engine/driving';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { CEREMONY, PARC_X, createCeremony, createPodiumDeck, podiumSpot, type Ceremony } from '../src/f1/podium3d';

/** What moves in the ceremony (the drivers, their trophies and bottles, the champagne and confetti): its stage. */
const stage = (c: Ceremony) => c.group.children.find((o) => o instanceof THREE.Group) as THREE.Group;
/** The ceremony's points (the champagne first, then the confetti), as their positions. */
const points = (c: Ceremony) => stage(c).children.filter((o): o is THREE.Points => o instanceof THREE.Points).map((p) => p.geometry.attributes.position as THREE.BufferAttribute);
const figures = (c: Ceremony) => stage(c).children.filter((o) => o.name === 'driver') as THREE.Group[];

describe('the champagne ceremony', () => {
  const three = () => [0, 1, 2].map(() => ({ body: '#fff', trim: '#000', helmet: '#fff', car: new THREE.Group() }));
  const play = (c: Ceremony, from: number, to: number) => {
    let popped = 0;
    for (let t = from; t < to; t += 1 / 60) if (c.update(t, 1 / 60).pop) popped++;
    return popped;
  };

  it('parks the top three cars nose to the camera, the winner in the middle, each driver up on their car', () => {
    const c = createCeremony('CRESCENT PARK');
    c.setDrivers([
      { body: '#1e2b5c', trim: '#f2c14e', helmet: '#f2c14e', car: new THREE.Group() },
      { body: '#dc0000', trim: '#fff200', helmet: '#f4f4f8', car: new THREE.Group() },
      { body: '#ff8000', trim: '#1b1b26', helmet: '#f4f4f8', car: new THREE.Group() },
    ]);
    play(c, 0, 1.2);
    expect(figures(c)).toHaveLength(3);
    const [p1, p2, p3] = figures(c);
    // second on the winner's left, third on the right, the same way apart
    expect(p2.position.x).toBeLessThan(p1.position.x);
    expect(p3.position.x).toBeGreaterThan(p1.position.x);
    expect(p1.position.x - p2.position.x).toBeCloseTo(p3.position.x - p1.position.x);
    // up on the cars (stood level), each over its own car, turned to face the camera
    for (const [k, f] of [p1, p2, p3].entries()) {
      expect(f.position.y).toBeGreaterThan(4);
      expect(f.position.x).toBe(PARC_X[k]);
    }
    const bays = c.group.children.filter((o) => o instanceof THREE.Group && o !== stage(c) && o.children.length === 1);
    expect(bays).toHaveLength(3);
    for (const bay of bays) expect(Math.abs(bay.rotation.y)).toBeCloseTo(Math.PI);
  });

  it('with fewer than three finishers, shows only those', () => {
    const c = createCeremony();
    c.setDrivers([{ body: '#fff', trim: '#000', helmet: '#f2c14e' }]);
    expect(figures(c).filter((f) => f.visible)).toHaveLength(1);
  });

  it('pops the corks once at the champagne beat and sprays from then on, the confetti falling from the trophies', () => {
    const c = createCeremony();
    c.setDrivers(three());
    const [spray, confetti] = points(c);
    const inTheAir = (p: THREE.BufferAttribute) => Array.from({ length: p.count }, (_, i) => p.getY(i)).filter((y) => y > 0).length;
    expect(play(c, 0, CEREMONY.trophy - 0.1)).toBe(0);
    expect(inTheAir(confetti)).toBe(0);
    expect(play(c, CEREMONY.trophy - 0.1, CEREMONY.spray + CEREMONY.pop - 0.05)).toBe(0);
    expect(inTheAir(spray)).toBe(0);
    expect(inTheAir(confetti)).toBeGreaterThan(50);
    expect(play(c, CEREMONY.spray + CEREMONY.pop - 0.05, CEREMONY.spray + 1.5)).toBe(1);
    expect(inTheAir(spray)).toBeGreaterThan(200);
    // (and again from the top the next time)
    c.setDrivers(three());
    expect(inTheAir(spray)).toBe(0);
    expect(play(c, 0, CEREMONY.len)).toBe(1);
  });

  it('holds the camera on third, then settles on the three of them, centred on the winner, all in view', () => {
    const c = createCeremony();
    for (const aspect of [390 / 760, 16 / 9]) {
      const start = c.view(0, aspect, 26);
      expect(start.at.x).toBe(PARC_X[2]);
      expect(c.view(1, aspect, 26).at.x).toBe(PARC_X[2]);
      const end = c.view(CEREMONY.len, aspect, 26);
      expect(end.at.x).toBe(0);
      expect(end.eye.x).toBe(0);
      expect(end.eye.distanceTo(end.at)).toBeGreaterThan(start.eye.distanceTo(start.at));
      // every car and its plate in the picture
      const cam = new THREE.PerspectiveCamera(26, aspect, 1, 4000);
      cam.position.copy(end.eye);
      cam.lookAt(end.at);
      cam.updateMatrixWorld();
      for (let k = 0; k < 3; k++) {
        for (const p of [new THREE.Vector3(PARC_X[k] - 8, 0, 0), new THREE.Vector3(PARC_X[k] + 8, 16, 0), c.plate(k)]) {
          const s = p.project(cam);
          expect(Math.abs(s.x)).toBeLessThan(1);
          expect(Math.abs(s.y)).toBeLessThan(1);
        }
      }
    }
  });

  const f1 = carClass('f1');
  const build = (layout: typeof ROYAL_PARK) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

  it('stands on the run-off across the main straight, just past the line, at an ordinary circuit', () => {
    const circuit = build(CRESCENT_PARK);
    const spot = podiumSpot(circuit);
    const at = circuit.track.samples[circuit.pit.podium[1].idx];
    expect(spot.raise).toBe(0);
    expect(Math.hypot(spot.x - at.x, spot.y - at.y)).toBeGreaterThan(60);
    expect(createPodiumDeck(circuit)).toBeUndefined();
  });

  it('hangs over the middle of the main straight at Royal Park, up on its deck', () => {
    const circuit = build(ROYAL_PARK);
    const spot = podiumSpot(circuit);
    const at = circuit.track.samples[circuit.pit.podium[1].idx];
    expect(spot.raise).toBe(ROYAL_PARK.podiumDeck);
    expect(Math.hypot(spot.x - at.x, spot.y - at.y)).toBeLessThan(1);
    // the deck: its top at the podium's height, reaching from the pit side out over the track
    const deck = createPodiumDeck(circuit)!;
    deck.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(deck);
    expect(box.max.y).toBeGreaterThan(spot.h + spot.raise);
  });
});
