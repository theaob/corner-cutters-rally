// The garage preview: every car body (src/engine/render/carBodies.ts) in a row, from the side at three quarters and
// from straight above as the stage's camera sees it, each in one of the paint schemes. ?scheme=<id> paints them all
// alike; ?dirt puts them on off-road tyres. A dev page, not built into the game.

import * as THREE from 'three';
import { createCarMesh } from '../../src/engine/render/vehicles3d';
import { CARS } from '../../src/f1/cars';
import { SCHEMES, liveryOf, schemeById } from '../../src/f1/crews';

const q = new URLSearchParams(location.search);
const one = schemeById(q.get('scheme'));
const dirt = q.has('dirt');
const W = innerWidth;
const H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(W, H);
renderer.setScissorTest(true);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const cols = CARS.length;
const cell = W / cols;
const rowH = H / 2;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8f4, 0x5a4a38, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(-40, 80, -30);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
sun.shadow.camera.right = sun.shadow.camera.top = 30;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: dirt ? 0x9a7b55 : 0x6b6f75 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const cars = CARS.map((c, i) => {
  const scheme = one ?? SCHEMES[[0, 3, 2, 6, 7, 4][i] ?? i];
  const mesh = createCarMesh('f1', { ...liveryOf(scheme), model: c.id }, dirt);
  scene.add(mesh);
  mesh.visible = false;
  return { car: c, mesh };
});

/** px of the frame per world px, so every car shows at one scale */
const side = new THREE.PerspectiveCamera(28, cell / rowH, 1, 500);
const top = new THREE.OrthographicCamera(-cell / 2 / 6, cell / 2 / 6, rowH / 2 / 6, -rowH / 2 / 6, 1, 500);
top.position.set(0, 120, 0);
top.up.set(0, 0, -1);
top.lookAt(0, 0, 0);
side.position.set(-62, 34, -44);
side.lookAt(0, 5, 0);

renderer.setClearColor(0x20242b);
cars.forEach(({ mesh }, i) => {
  for (const m of cars) m.mesh.visible = m.mesh === mesh;
  const x = i * cell;
  renderer.setViewport(x, rowH, cell, rowH);
  renderer.setScissor(x, rowH, cell, rowH);
  renderer.render(scene, side);
  mesh.rotation.y = -Math.PI / 4; // (driving up and to the right, as on a stage)
  renderer.setViewport(x, 0, cell, rowH);
  renderer.setScissor(x, 0, cell, rowH);
  renderer.render(scene, top);
  mesh.rotation.y = 0;
});

// the names under the side views
for (const [i, { car }] of cars.entries()) {
  const label = document.createElement('div');
  label.style.cssText = `position:absolute;left:${i * cell}px;width:${cell}px;top:${rowH - 44}px;text-align:center;line-height:1.3`;
  label.innerHTML = `${car.name}<br><span style="opacity:.7;font-weight:500">${car.era} · ${car.unlock} PTS</span>`;
  document.body.appendChild(label);
}
document.body.dataset.ready = '1';
