// Fewer draw calls: boxes (or any geometry) with a material a face made one
// mesh, their faces gathered by material. A box of six materials is six draw
// calls, and six again for its shadow; many of them, too many for a phone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One mesh of `boxes` (each with a material a face, as BoxGeometry's groups have them): their faces gathered by material, a group each. */
export function mergedByMaterial(boxes: { geometry: THREE.BufferGeometry; faces: THREE.Material[] }[]): THREE.Mesh {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const { geometry, faces } of boxes) {
    for (const g of geometry.groups) {
      const face = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) face.setAttribute(name, geometry.getAttribute(name));
      face.setIndex(Array.from(geometry.index!.array.slice(g.start, g.start + g.count)));
      // (a cone's groups are 0 and 2, its top cap left out: a face past those given takes the first's material)
      const material = faces[g.materialIndex ?? 0] ?? faces[0];
      byMaterial.set(material, [...(byMaterial.get(material) ?? []), face.toNonIndexed()]);
    }
    geometry.dispose();
  }
  const materials = [...byMaterial.keys()];
  const merged = mergeGeometries(materials.map((m) => mergeGeometries(byMaterial.get(m)!)), true);
  return new THREE.Mesh(merged, materials);
}


/**
 * Bake `group`'s plain parts into one mesh: each mesh under it with a single opaque, untextured Lambert material
 * (its colour put on its vertices) becomes part of one geometry, drawn with `material`, in one draw call (and one
 * more for its shadow) where they were a draw call each. Parts with a texture, a see-through or another kind of
 * material, or more than one, are left as they are. The baked mesh takes the group's place for its parts: added
 * to the group, the parts removed (so a group that moves, a boat bobbing, still moves them all). Gives back how
 * many parts were baked.
 */
export function bakeColours(group: THREE.Object3D, material: THREE.Material = BAKED): number {
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.MeshLambertMaterial;
    if (!mat.isMeshLambertMaterial || mat.map || mat.transparent || mat.vertexColors) return;
    parts.push(m);
  });
  if (parts.length < 2) return 0;
  const pieces = parts.map((m) => {
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroup, m.matrixWorld));
    const c = (m.material as THREE.MeshLambertMaterial).color;
    const n = g.getAttribute('position').count;
    const colours = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) colours.set([c.r, c.g, c.b], k * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    out.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return out;
  });
  const baked = new THREE.Mesh(mergeGeometries(pieces), material);
  baked.castShadow = parts.some((m) => m.castShadow);
  baked.receiveShadow = parts.some((m) => m.receiveShadow);
  for (const m of parts) m.removeFromParent();
  group.add(baked);
  return parts.length;
}

/** The material baked parts are drawn with: Lambert, coloured by its vertices (the parts' own colours). */
const BAKED = new THREE.MeshLambertMaterial({ vertexColors: true });
