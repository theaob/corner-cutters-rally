// HD-2D post-processing: glow (bloom), a tilt-shift depth blur that keeps a
// horizontal band sharp, and a warm colour grade with a vignette.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutputShader } from 'three/addons/shaders/OutputShader.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { frameDrawn } from './capture';


export interface Hd2dSettings {
  bloom: number;
  blur: number;
  bloomOn: boolean;
  blurOn: boolean;
}

const FULLSCREEN_VERT =
  'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/** The tilt-shift's blur amount at a point of the screen: 0 in the sharp band, growing above and below it. */
const BAND_GLSL = `
  uniform float focus; uniform float band;
  float blurAt(vec2 uv) { return smoothstep(0.0, 0.3, max(0.0, abs(uv.y - focus) - band)); }`;

/** One direction of a separable blur that is sharp in a horizontal band and softens above and below it. */
const BLUR_FRAG = `
  uniform sampler2D tDiffuse; uniform float amount; uniform vec2 res; uniform vec2 dir; varying vec2 vUv;
  ${BAND_GLSL}
  void main() {
    vec2 stepUv = dir / res * amount * blurAt(vUv);
    vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
    c += texture2D(tDiffuse, vUv + stepUv * 1.3846153846) * 0.3162162162;
    c += texture2D(tDiffuse, vUv - stepUv * 1.3846153846) * 0.3162162162;
    c += texture2D(tDiffuse, vUv + stepUv * 3.2307692308) * 0.0702702703;
    c += texture2D(tDiffuse, vUv - stepUv * 3.2307692308) * 0.0702702703;
    gl_FragColor = c;
  }`;

/** The last blur, up at the screen's size, mixed over the sharp picture so the band stays as sharp as it was. */
const BLUR_COMPOSITE_FRAG = `
  uniform sampler2D tDiffuse; uniform sampler2D tSharp; uniform float amount; uniform vec2 res; varying vec2 vUv;
  ${BAND_GLSL}
  void main() {
    float w = blurAt(vUv);
    vec2 stepUv = vec2(0.0, 1.0) / res * amount * w;
    vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
    c += texture2D(tDiffuse, vUv + stepUv * 1.3846153846) * 0.3162162162;
    c += texture2D(tDiffuse, vUv - stepUv * 1.3846153846) * 0.3162162162;
    c += texture2D(tDiffuse, vUv + stepUv * 3.2307692308) * 0.0702702703;
    c += texture2D(tDiffuse, vUv - stepUv * 3.2307692308) * 0.0702702703;
    // (the half-size blur is already soft, so it takes over from the sharp picture quickly: by a third of the way out)
    gl_FragColor = mix(texture2D(tSharp, vUv), c, min(1.0, w * 3.0));
  }`;

/**
 * The tilt-shift: horizontal, vertical, horizontal, vertical blurs, the first three at half the screen's size (a blur
 * hides the missing detail, and a quarter of the pixels is a quarter of the cost), the last at full size over the sharp
 * picture. It was four passes at full size.
 */
class TiltShiftPass extends Pass {
  readonly focus = 0.5;
  private readonly res = new THREE.Vector2(1, 1);
  private readonly small = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }));
  private readonly steps: { material: THREE.ShaderMaterial; quad: FullScreenQuad }[];
  private readonly composite: { material: THREE.ShaderMaterial; quad: FullScreenQuad };
  amount = 1.2;

  constructor() {
    super();
    const common = () => ({ tDiffuse: { value: null as THREE.Texture | null }, amount: { value: 1.2 }, res: { value: this.res }, focus: { value: this.focus }, band: { value: 0.16 } });
    const make = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => {
      const material = new THREE.ShaderMaterial({ uniforms, vertexShader: FULLSCREEN_VERT, fragmentShader, depthTest: false, depthWrite: false });
      return { material, quad: new FullScreenQuad(material) };
    };
    this.steps = [new THREE.Vector2(1, 0), new THREE.Vector2(0, 1), new THREE.Vector2(1, 0)].map((dir) => make(BLUR_FRAG, { ...common(), dir: { value: dir } }));
    this.composite = make(BLUR_COMPOSITE_FRAG, { ...common(), tSharp: { value: null } });
  }

  /** What the blur's step is measured against (as the screen's size has always been given: apart from the targets' own pixels). */
  setRes(w: number, h: number): void {
    this.res.set(w, h);
  }

  /** The composer's size for its targets (in pixels): the half-size targets follow it. */
  setSize(w: number, h: number): void {
    for (const t of this.small) t.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    // (the half-size targets take the picture's own type, so a high-range picture isn't clipped on the way)
    for (const t of this.small) if (t.texture.type !== readBuffer.texture.type) { t.texture.type = readBuffer.texture.type; t.dispose(); }
    let src: THREE.Texture = readBuffer.texture;
    this.steps.forEach((step, i) => {
      step.material.uniforms.tDiffuse.value = src;
      step.material.uniforms.amount.value = this.amount;
      const to = this.small[i % 2];
      renderer.setRenderTarget(to);
      step.quad.render(renderer);
      src = to.texture;
    });
    const u = this.composite.material.uniforms;
    u.tDiffuse.value = src;
    u.tSharp.value = readBuffer.texture;
    u.amount.value = this.amount;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.composite.quad.render(renderer);
  }

  dispose(): void {
    for (const t of this.small) t.dispose();
    for (const s of [...this.steps, this.composite]) { s.material.dispose(); s.quad.dispose(); }
  }
}

/** The output pass with the warm grade, gentle S-curve and vignette folded in ahead of its tone mapping: one pass fewer over the whole screen. */
class GradedOutputPass extends OutputPass {
  constructor() {
    super();
    this.material.fragmentShader = OutputShader.fragmentShader.replace(
      'gl_FragColor = texture2D( tDiffuse, vUv );',
      `gl_FragColor = texture2D( tDiffuse, vUv );
      {
        vec3 c = gl_FragColor.rgb;
        c *= vec3(1.06, 1.0, 0.92);
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
        float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5, 0.52)));
        gl_FragColor.rgb = c * mix(0.65, 1.0, v);
      }`,
    );
    this.material.needsUpdate = true;
  }
}

export class Hd2dPipeline {
  private readonly composer: EffectComposer;
  private readonly scenePass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private readonly blurPass: TiltShiftPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.scenePass = new RenderPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.blurPass = new TiltShiftPass();
    this.composer.addPass(this.blurPass);
    this.composer.addPass(new GradedOutputPass());
  }

  /** Draw a different scene from now on. */
  setScene(scene: THREE.Scene): void {
    this.scenePass.scene = scene;
  }

  /** Draw a different scene, through a different camera, from now on (the next screen to use the shared view: sharedView.ts). */
  setView(scene: THREE.Scene, camera: THREE.Camera): void {
    this.scenePass.scene = scene;
    this.scenePass.camera = camera;
  }

  /** Free the render targets and passes (the view is closing). */
  dispose(): void {
    this.bloom.dispose();
    this.blurPass.dispose();
    this.composer.dispose();
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.blurPass.setRes(w, h);
  }

  render(dt: number, s: Hd2dSettings): void {
    this.bloom.enabled = s.bloomOn && s.bloom > 0;
    this.bloom.strength = s.bloom;
    this.blurPass.enabled = s.blurOn && s.blur > 0;
    this.blurPass.amount = s.blur;
    this.composer.render(dt);
    // (a screenshot waiting for this frame: copied now, while it can still be read)
    frameDrawn(this.composer.renderer.domElement);
  }
}
