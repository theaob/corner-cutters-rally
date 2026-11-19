// The garage preview: every car body (src/engine/render/carBodies.ts) in a row, from the side at three quarters and
// from straight above as the stage's camera sees it, each in its own paint (or one of the schemes). ?car=<id> shows one
// car close: front and rear three quarters, the side, and from above. ?scheme=<id> paints them all alike; ?dirt puts
// them on off-road tyres. A dev page, not built into the game.

import * as THREE from 'three';
import { createCarMesh } from '../../src/engine/render/vehicles3d';
import { CARS } from '../../src/f1/cars';
import { SCHEMES, liveryOf, schemeById } from '../../src/f1/crews';

const q = new URLSearchParams(location.search);
const one = schemeById(q.get('scheme'));
const dirt = q.has('dirt');
/** ?night: the cars in their night floodlights */
const night = q.has('night');
const only = CARS.find((c) => c.id === q.get('car'));
const W = innerWidth;
const H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(W, H);
renderer.setScissorTest(true);
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x20242b);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8f4, 0x5a4a38, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(-40, 80, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
sun.shadow.camera.right = sun.shadow.camera.top = 30;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: dirt ? 0x9a7b55 : 0x6b6f75 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const list = only ? [only] : CARS;
const cars = list.map((c, i) => {
  const paint = one ? liveryOf(one) : (c.paint ?? liveryOf(SCHEMES[[0, 3, 2, 6, 7, 4][i] ?? i]));
  const mesh = createCarMesh('f1', { ...paint, model: c.id, floodlights: night }, dirt);
  scene.add(mesh);
  return { car: c, mesh };
});

/** draw the scene from `camera` into the frame's (x, y, w, h), y from the bottom */
const view = (camera: THREE.Camera, x: number, y: number, w: number, h: number) => {
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.render(scene, camera);
};
const persp = (w: number, h: number, from: [number, number, number], fov = 28) => {
  const c = new THREE.PerspectiveCamera(fov, w / h, 1, 500);
  c.position.set(...from);
  c.lookAt(0, 5, 0);
  return c;
};
const above = (w: number, h: number, px: number) => {
  const c = new THREE.OrthographicCamera(-w / 2 / px, w / 2 / px, h / 2 / px, -h / 2 / px, 1, 500);
  c.position.set(0, 120, 0);
  c.up.set(0, 0, -1);
  c.lookAt(0, 0, 0);
  return c;
};
const label = (text: string, x: number, top: number, w: number) => {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${x}px;width:${w}px;top:${top}px;text-align:center;line-height:1.3`;
  el.innerHTML = text;
  document.body.appendChild(el);
};

if (only) {
  const { mesh } = cars[0];
  const w = W / 2;
  const h = H / 2;
  view(persp(w, h, [-34, 22, -40], 26), 0, h, w, h); // front three quarters
  view(persp(w, h, [34, 20, 40], 26), w, h, w, h); // rear three quarters
  view(persp(w, h, [-70, 6, 0], 22), 0, 0, w, h); // the side
  mesh.rotation.y = -Math.PI / 4; // (driving up and to the right, as on a stage)
  view(above(w, h, 9), w, 0, w, h);
  label(`${only.name}<br><span style="opacity:.7;font-weight:500">${only.era}</span>`, 0, 12, W);
} else {
  const cell = W / cars.length;
  const rowH = H / 2;
  const side = persp(cell, rowH, [-62, 34, -44]);
  const top = above(cell, rowH, 6);
  cars.forEach(({ mesh }, i) => {
    for (const m of cars) m.mesh.visible = m.mesh === mesh;
    view(side, i * cell, rowH, cell, rowH);
    mesh.rotation.y = -Math.PI / 4;
    view(top, i * cell, 0, cell, rowH);
    mesh.rotation.y = 0;
  });
  for (const [i, { car }] of cars.entries()) {
    label(`${car.name}<br><span style="opacity:.7;font-weight:500">${car.era} · ${car.unlock} PTS</span>`, i * cell, rowH - 44, cell);
  }
}
document.body.dataset.ready = '1';
