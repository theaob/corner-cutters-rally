import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SHARED_VIEW, borrowView, returnView, useViewMaker, viewHolds, type SharedView } from '../src/engine/render/sharedView';
import { disposeDeep } from '../src/engine/render/dispose';

/** A renderer as far as the shared view uses one (no WebGL in the tests). */
function fakeView() {
  const state = { lost: false, disposed: false, programs: [] as { usedTimes: number }[], memory: { geometries: 0, textures: 0 } };
  const canvas = { className: 'live-backdrop on', removeAttribute: vi.fn(), remove: vi.fn() };
  const renderer = {
    domElement: canvas,
    shadowMap: { enabled: true },
    info: { autoReset: false, programs: state.programs, memory: state.memory },
    getContext: () => ({ isContextLost: () => state.lost }),
    setRenderTarget: vi.fn(),
    renderLists: { dispose: vi.fn() },
    setSize: vi.fn(),
    dispose: () => void (state.disposed = true),
    forceContextLoss: vi.fn(),
  };
  const post = { setView: vi.fn(), setSize: vi.fn(), dispose: vi.fn() };
  return { view: { renderer, post } as unknown as SharedView, state, canvas, post };
}

describe('the one renderer the backdrop and the races share', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  let made: ReturnType<typeof fakeView>[];

  beforeEach(() => {
    made = [];
    useViewMaker(() => {
      const f = fakeView();
      made.push(f);
      return f.view;
    });
  });

  it('is made once, and handed plain to each screen in turn', () => {
    const a = borrowView(scene, camera, () => {});
    returnView(a);
    expect(made[0].canvas.remove).toHaveBeenCalled();
    const scene2 = new THREE.Scene();
    const b = borrowView(scene2, camera, () => {});
    expect(b).toBe(a);
    expect(made).toHaveLength(1);
    expect(made[0].post.setView).toHaveBeenCalledWith(scene2, camera);
    expect(b.renderer.shadowMap.enabled).toBe(false);
    expect(b.renderer.info.autoReset).toBe(true);
    expect(b.renderer.domElement.className).toBe('');
  });

  it('keeps the compiled programs when the scene that used them is disposed', () => {
    const v = borrowView(scene, camera, () => {});
    // (two programs, each used by one material)
    made[0].state.programs.push({ usedTimes: 1 }, { usedTimes: 1 });
    returnView(v);
    // (the materials disposed: three.js takes a use off each, and destroys a program at none)
    for (const p of made[0].state.programs) p.usedTimes--;
    expect(made[0].state.programs.map((p) => p.usedTimes)).toEqual([1, 1]);
    // the next race uses them again, and a new one; given back, only the new one is taken hold of
    borrowView(scene, camera, () => {});
    for (const p of made[0].state.programs) p.usedTimes++;
    made[0].state.programs.push({ usedTimes: 1 });
    returnView(v);
    expect(made[0].state.programs.map((p) => p.usedTimes)).toEqual([2, 2, 2]);
    expect(viewHolds().programs).toBe(3);
  });

  it('shrinks its buffers while nobody is drawing', () => {
    const v = borrowView(scene, camera, () => {});
    returnView(v);
    expect(v.renderer.setSize).toHaveBeenCalledWith(1, 1, false);
    expect(made[0].post.setSize).toHaveBeenCalledWith(1, 1);
  });

  it('a screen borrowing while another has it: the other is told to stop first', () => {
    const order: string[] = [];
    const a = borrowView(scene, camera, () => {
      order.push('backdrop stopped');
      returnView(a);
    });
    const b = borrowView(scene, camera, () => {});
    order.push('race has it');
    expect(order).toEqual(['backdrop stopped', 'race has it']);
    expect(b).toBe(a);
    // (the backdrop's stop called again later, by its screen closing, takes nothing from the race)
    returnView(b);
    const stop = vi.fn();
    borrowView(scene, camera, stop);
    borrowView(scene, camera, () => {});
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('a context the phone took away is replaced, when given back or when next borrowed', () => {
    const a = borrowView(scene, camera, () => {});
    made[0].state.lost = true;
    returnView(a);
    expect(made[0].state.disposed).toBe(true);
    const b = borrowView(scene, camera, () => {});
    expect(b).not.toBe(a);
    returnView(b);
    made[1].state.lost = true;
    expect(borrowView(scene, camera, () => {})).not.toBe(b);
    expect(made).toHaveLength(3);
  });

  it('starts afresh past too many programs, or with too much left behind on the GPU', () => {
    const a = borrowView(scene, camera, () => {});
    for (let i = 0; i <= SHARED_VIEW.maxPrograms; i++) made[0].state.programs.push({ usedTimes: 1 });
    returnView(a);
    expect(made[0].state.disposed).toBe(true);
    const b = borrowView(scene, camera, () => {});
    returnView(b);
    made[1].state.memory.geometries = SHARED_VIEW.maxLeft;
    made[1].state.memory.textures = 1;
    const c = borrowView(scene, camera, () => {});
    expect(c).not.toBe(b);
    expect(made[1].state.disposed).toBe(true);
  });

  it('a view given back twice, or an old one, changes nothing', () => {
    const a = borrowView(scene, camera, () => {});
    made[0].state.programs.push({ usedTimes: 1 });
    returnView(a);
    returnView(a);
    expect(made[0].state.programs[0].usedTimes).toBe(2);
    made[0].state.lost = true;
    const b = borrowView(scene, camera, () => {});
    returnView(a);
    expect(made[1].canvas.remove).not.toHaveBeenCalled();
    returnView(b);
    expect(made[1].canvas.remove).toHaveBeenCalled();
  });
});

describe('a scene disposed for the next screen', () => {
  it("frees its lights' shadow maps too (the renderer stays, so nothing else would)", () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight();
    const dispose = vi.fn();
    sun.shadow.map = { dispose } as unknown as THREE.WebGLRenderTarget;
    scene.add(sun, new THREE.AmbientLight(), new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    expect(() => disposeDeep(scene)).not.toThrow();
    expect(dispose).toHaveBeenCalled();
  });
});
