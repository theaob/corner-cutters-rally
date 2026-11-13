import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { drawWhole } from '../src/engine/render/warm';

describe('drawWhole', () => {
  it('shows everything and turns culling off for the draw, then restores it', () => {
    const scene = new THREE.Scene();
    const hidden = new THREE.Mesh();
    hidden.visible = false;
    const culled = new THREE.Mesh();
    const off = new THREE.Group();
    scene.add(hidden, culled);
    const seen: boolean[] = [];
    drawWhole(scene, () => {
      seen.push(hidden.visible, culled.frustumCulled, off.parent === scene);
    }, [off]);
    expect(seen).toEqual([true, false, true]);
    expect(hidden.visible).toBe(false);
    expect(culled.frustumCulled).toBe(true);
    expect(off.parent).toBeNull();
  });
  it('restores even if the draw throws', () => {
    const scene = new THREE.Scene();
    const m = new THREE.Mesh();
    m.visible = false;
    scene.add(m);
    expect(() => drawWhole(scene, () => { throw new Error('x'); })).toThrow();
    expect(m.visible).toBe(false);
  });
});
