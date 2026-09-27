import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";
import { rng } from "../common/util";

// Points of light in world space, all in one additive draw: the crowd in the
// plaza, paper-lantern strings, red LED strings on the pagoda eaves, aviation
// lights, street lamps, rooftop garden lights. Each dot keeps a minimum pixel
// size (and dims instead of shimmering when it gets that small), hides behind
// buildings via the G-buffer depth, and can twinkle, wander, blink or sway.

export const DotKind = { Still: 0, Wander: 1, Blink: 2, Sway: 3, Drift: 4 } as const;

export type DotOptions = {
  /** 0 … 1 brightness modulation amount. */
  twinkle?: number;
  phase?: number;
  speed?: number;
  /** Wander / sway radius (m) or drift height. */
  amp?: number;
  kind?: number;
};

const vert = /* glsl */ `
${common}
attribute vec4 aPos;   // xyz, radius (m)
attribute vec4 aCol;   // rgb (HDR), twinkle
attribute vec4 aAnim;  // phase, speed, amp, kind
uniform float uTime;
uniform float uPxAngle;
uniform float uMinPx;
uniform float uGain;
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;

void main() {
  vec3 p = aPos.xyz;
  float ph = aAnim.x;
  float sp = aAnim.y;
  float amp = aAnim.z;
  float kind = aAnim.w;
  float k = 1.0;
  if (kind > 0.5 && kind < 1.5) {
    // wander: a slow, wobbly loop around home
    p.xz += amp * vec2(sin(uTime * sp + ph * 6.283) + 0.4 * sin(uTime * sp * 2.3 + ph * 17.0), cos(uTime * sp * 0.83 + ph * 9.1));
  } else if (kind > 1.5 && kind < 2.5) {
    // blink: aviation style
    k = 0.08 + 0.92 * step(0.55, fract(uTime * sp + ph));
  } else if (kind > 2.5 && kind < 3.5) {
    // sway: hanging lanterns in the breeze
    float s = sin(uTime * sp + ph * 6.283);
    p.x += amp * s;
    p.z += amp * 0.6 * cos(uTime * sp * 0.7 + ph * 4.0);
  } else if (kind > 3.5) {
    // drift: petals / sparks falling slowly and sideways, looping
    float f = fract(uTime * sp / max(amp, 1e-3) + ph);
    p.y -= f * amp;
    p.x += sin(uTime * 0.7 + ph * 30.0) * 1.5 + f * amp * 0.6;
    p.z += cos(uTime * 0.5 + ph * 20.0) * 1.5;
    k = smoothstep(0.0, 0.1, f) * smoothstep(1.0, 0.8, f);
  }
  float tw = 1.0 - aCol.w * (0.5 + 0.5 * sin(uTime * (1.5 + sp * 2.0) + ph * 40.0));
  vec4 vp = viewMatrix * vec4(p, 1.0);
  float depth = max(-vp.z, 0.01);
  float r = aPos.w;
  float minR = depth * uPxAngle * uMinPx;
  float s = max(r, minR);
  // keep (most of) the energy constant when a dot is inflated to its minimum size
  float energy = pow(r / s, 1.4);
  vp.xy += position.xy * s * 2.2;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy;
  vCol = aCol.rgb * energy * tw * k * uGain;
  // test a little in front of the dot (dots sit on roofs and ground)
  vViewZ = depth - max(1.2, depth * 0.004) - r;
}`;

const frag = /* glsl */ `
${common}
${fxDepthTest}
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;

void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float core = smoothstep(0.46, 0.2, r);
  float halo = exp(-r * r * 6.0) * 0.5;
  gl_FragColor = vec4(vCol * (core + halo) * vis, 1.0);
}`;

export class Dots {
  private p: number[] = [];
  private c: number[] = [];
  private a: number[] = [];
  mesh: THREE.Mesh | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private rand = rng(90917);

  get count() {
    return this.p.length / 4;
  }

  add(x: number, y: number, z: number, radius: number, col: THREE.Color, intensity: number, o: DotOptions = {}) {
    this.p.push(x, y, z, radius);
    this.c.push(col.r * intensity, col.g * intensity, col.b * intensity, o.twinkle ?? 0);
    this.a.push(o.phase ?? this.rand(), o.speed ?? 1, o.amp ?? 0, o.kind ?? DotKind.Still);
  }

  build(minPx = 1.6): THREE.Mesh {
    const n = this.count;
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(new Float32Array(this.p), 4));
    g.setAttribute("aCol", new THREE.InstancedBufferAttribute(new Float32Array(this.c), 4));
    g.setAttribute("aAnim", new THREE.InstancedBufferAttribute(new Float32Array(this.a), 4));
    g.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        ...fxShared,
        uTime: env.uTime,
        uPxAngle: { value: 0.001 },
        uMinPx: { value: minPx },
        uGain: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.p = [];
    this.c = [];
    this.a = [];
    return this.mesh;
  }

  update(camera: THREE.PerspectiveCamera, heightPx: number) {
    if (this.mat) this.mat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
  }
}
