// HD-2D post-processing: glow (bloom), a tilt-shift depth blur that keeps a
// horizontal band sharp, and a warm colour grade with a vignette.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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

/** One direction of a separable blur that is sharp in a horizontal band and softens above and below it. */
function tiltShift(dir: THREE.Vector2) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      amount: { value: 1.2 },
      res: { value: new THREE.Vector2(1, 1) },
      dir: { value: dir },
      focus: { value: 0.5 },
      band: { value: 0.16 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float amount; uniform vec2 res; uniform vec2 dir;
      uniform float focus; uniform float band; varying vec2 vUv;
      void main() {
        float d = max(0.0, abs(vUv.y - focus) - band);
        vec2 stepUv = dir / res * amount * smoothstep(0.0, 0.3, d);
        vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
        c += texture2D(tDiffuse, vUv + stepUv * 1.3846153846) * 0.3162162162;
        c += texture2D(tDiffuse, vUv - stepUv * 1.3846153846) * 0.3162162162;
        c += texture2D(tDiffuse, vUv + stepUv * 3.2307692308) * 0.0702702703;
        c += texture2D(tDiffuse, vUv - stepUv * 3.2307692308) * 0.0702702703;
        gl_FragColor = c;
      }`,
  };
}

/** Warm grade, gentle S-curve and vignette. */
const GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= vec3(1.06, 1.0, 0.92);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);
      float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5, 0.52)));
      c.rgb *= mix(0.65, 1.0, v);
      gl_FragColor = c;
    }`,
};

export class Hd2dPipeline {
  private readonly composer: EffectComposer;
  private readonly scenePass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private readonly blurPasses: ShaderPass[];

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.scenePass = new RenderPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.blurPasses = [new THREE.Vector2(1, 0), new THREE.Vector2(0, 1), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)].map((dir) => {
      const pass = new ShaderPass(tiltShift(dir));
      this.composer.addPass(pass);
      return pass;
    });
    this.composer.addPass(new ShaderPass(GRADE));
    this.composer.addPass(new OutputPass());
  }

  /** Draw a different scene from now on. */
  setScene(scene: THREE.Scene): void {
    this.scenePass.scene = scene;
  }

  /** Free the render targets and passes (the view is closing). */
  dispose(): void {
    this.bloom.dispose();
    for (const p of this.blurPasses) p.dispose();
    this.composer.dispose();
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    for (const pass of this.blurPasses) pass.uniforms.res.value.set(w, h);
  }

  render(dt: number, s: Hd2dSettings): void {
    this.bloom.enabled = s.bloomOn && s.bloom > 0;
    this.bloom.strength = s.bloom;
    for (const pass of this.blurPasses) {
      pass.enabled = s.blurOn && s.blur > 0;
      pass.uniforms.amount.value = s.blur;
    }
    this.composer.render(dt);
    // (a screenshot waiting for this frame: copied now, while it can still be read)
    frameDrawn(this.composer.renderer.domElement);
  }
}
