import * as THREE from "three";
import { common } from "../engine/glsl";
import { G } from "./atmos";

// Hanabi on click. Each burst is a rising comet followed by a shell of
// motion-blurred sparks with analytic drag and gravity, evaluated entirely
// in the vertex shader. Shell types: kiku (chrysanthemum), yanagi (willow,
// long drooping gold trails) and a flat ring. The palette stays classical:
// gold, pale vermilion, sakura pink, silver, pale jade.

const MAX_BURSTS = 10;
const PER_BURST = 520;
const ROCKET = 16;

const vert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iP; // burst index, particle index, seed, seed2
uniform vec4 uBurst[${MAX_BURSTS}]; // origin xyz, start time
uniform vec4 uKind[${MAX_BURSTS}];  // type, palette, radius, rise height
uniform float uTime;
uniform vec2 uRes;
varying vec2 vQ;
varying vec3 vCol;
varying float vA;

vec3 palette(float k, float s) {
  if (k < 0.5) return mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.62, 0.3), s);        // gold
  if (k < 1.5) return mix(vec3(1.0, 0.5, 0.38), vec3(1.0, 0.72, 0.6), s);         // vermilion
  if (k < 2.5) return mix(vec3(1.0, 0.66, 0.78), vec3(1.0, 0.86, 0.9), s);        // sakura
  if (k < 3.5) return mix(vec3(0.86, 0.92, 1.0), vec3(1.0, 1.0, 1.0), s);         // silver
  return mix(vec3(0.55, 1.0, 0.86), vec3(0.8, 1.0, 0.94), s);                     // jade
}

// Position of a spark under drag k and gravity g after time t, launched at v.
vec3 ballistic(vec3 v, float t, float k, float g) {
  float e = (1.0 - exp(-k * t)) / k;
  return v * e + vec3(0.0, -g * (t - e) / k, 0.0);
}

void main() {
  int b = int(iP.x + 0.5);
  vec4 B = uBurst[b];
  vec4 K = uKind[b];
  float age = uTime - B.w;
  float idx = iP.y;
  vec3 origin = B.xyz;
  vec3 pNow, pPrev;
  float alpha = 0.0;
  vec3 col;
  float size;
  float rise = 1.05;
  vQ = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  if (age < 0.0 || age > rise + 5.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (idx < ${ROCKET}.0) {
    // The rising comet and its short wake.
    float lag = idx * 0.022;
    float tt = clamp((age - lag) / rise, 0.0, 1.0);
    float h = 1.0 - (1.0 - tt) * (1.0 - tt);
    vec3 start = origin - vec3(0.0, K.w, 0.0);
    pNow = mix(start, origin, h) + vec3(sin(tt * 9.0 + iP.z * 6.0), 0.0, cos(tt * 7.0)) * 0.4 * (1.0 - tt);
    float tp = clamp((age - lag - 0.03) / rise, 0.0, 1.0);
    pPrev = mix(start, origin, 1.0 - (1.0 - tp) * (1.0 - tp));
    alpha = (age < rise ? 1.0 : 0.0) * (1.0 - idx / ${ROCKET}.0) * step(lag, age);
    col = vec3(1.0, 0.8, 0.55);
    size = 0.35;
  } else {
    float t = age - rise;
    if (t < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float type = K.x;
    // Direction: Fibonacci sphere, or a tilted ring.
    float i = idx - ${ROCKET}.0;
    float n = ${PER_BURST - ROCKET}.0;
    vec3 dir;
    if (type > 1.5) {
      float a = i / n * TAU;
      dir = vec3(cos(a), sin(a) * 0.35, sin(a));
      dir = normalize(dir + (hash31(iP.z * 91.0) - 0.5) * 0.06);
    } else {
      float y = 1.0 - (i + 0.5) / n * 2.0;
      float r = sqrt(1.0 - y * y);
      float a = i * 2.39996;
      dir = vec3(cos(a) * r, y, sin(a) * r);
      dir = normalize(dir + (hash31(iP.z * 37.0) - 0.5) * 0.12);
    }
    float speed = K.z * mix(0.92, 1.05, iP.w);
    float k = type > 0.5 && type < 1.5 ? 0.9 : 1.7;  // willow keeps drifting
    float g = type > 0.5 && type < 1.5 ? 7.5 : 5.0;
    float life = type > 0.5 && type < 1.5 ? 4.6 : 2.8;
    life *= mix(0.8, 1.1, iP.z);
    vec3 v = dir * speed * k;
    pNow = origin + ballistic(v, t, k, g);
    float trail = type > 0.5 && type < 1.5 ? 0.42 : 0.12;
    pPrev = origin + ballistic(v, max(0.0, t - trail), k, g);
    float fade = 1.0 - smoothstep(life * 0.55, life, t);
    // Crackle near the end.
    float crackle = t > life * 0.6 ? step(0.45, fract(sin(uTime * 40.0 + iP.z * 300.0) * 43758.5)) : 1.0;
    alpha = fade * crackle * smoothstep(0.0, 0.06, t);
    col = palette(K.y, iP.w);
    // Hot white core right after the break.
    col = mix(vec3(1.0, 0.97, 0.9), col, smoothstep(0.0, 0.35, t));
    size = mix(0.5, 0.28, clamp(t / life, 0.0, 1.0));
  }
  vec4 c1 = projectionMatrix * viewMatrix * vec4(pNow, 1.0);
  vec4 c0 = projectionMatrix * viewMatrix * vec4(pPrev, 1.0);
  if (c1.w < 0.5 || c0.w < 0.5 || alpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 s1 = c1.xy / c1.w * 0.5 * uRes;
  vec2 s0 = c0.xy / c0.w * 0.5 * uRes;
  vec2 d = s1 - s0;
  float L = length(d);
  vec2 tng = L > 1e-3 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-tng.y, tng.x);
  float px = max(1.2, size * uRes.y * projectionMatrix[1][1] * 0.5 / c1.w);
  float along = vQ.x * 0.5 + 0.5;
  vec2 sp = mix(s0 - tng * px, s1 + tng * px, along) + nrm * vQ.y * px;
  gl_Position = vec4(sp / (0.5 * uRes) * c1.w, c1.z, c1.w);
  vCol = col;
  // Energy spread over the streak length.
  vA = alpha * px / (px + L * 0.25);
}`;

const frag = /* glsl */ `
uniform float uGain;
varying vec2 vQ;
varying vec3 vCol;
varying float vA;
void main() {
  float d = vQ.y * vQ.y;
  float head = smoothstep(-1.0, 1.0, vQ.x);
  float g = exp(-d * 3.0) * mix(0.35, 1.0, head);
  gl_FragColor = vec4(vCol * g * vA * uGain, 1.0);
}`;

export class Fireworks {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private bursts: THREE.Vector4[];
  private kinds: THREE.Vector4[];
  private cursor = 0;
  private lastKind = -1;
  /** Seconds since the most recent break (for a light flash). */
  flash = 0;

  constructor() {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    geo.setAttribute("corner", new THREE.Float32BufferAttribute([0, 1, 2, 3], 1));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const n = MAX_BURSTS * PER_BURST;
    const ip = new Float32Array(n * 4);
    for (let b = 0; b < MAX_BURSTS; b++) {
      for (let i = 0; i < PER_BURST; i++) {
        const k = b * PER_BURST + i;
        ip.set([b, i, Math.random(), Math.random()], k * 4);
      }
    }
    geo.setAttribute("iP", new THREE.InstancedBufferAttribute(ip, 4));
    geo.instanceCount = n;
    this.bursts = Array.from({ length: MAX_BURSTS }, () => new THREE.Vector4(0, -1000, 0, -100));
    this.kinds = Array.from({ length: MAX_BURSTS }, () => new THREE.Vector4());
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uBurst: { value: this.bursts },
        uKind: { value: this.kinds },
        uTime: G.uTime,
        uRes: G.uRes,
        uGain: { value: 2.4 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }

  /** Launch a shell that breaks at `at` (world), rising `rise` metres. */
  launch(at: THREE.Vector3, now: number, rise = 90, radius = 26) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_BURSTS;
    let type = Math.floor(Math.random() * 3);
    if (type === this.lastKind) type = (type + 1) % 3;
    this.lastKind = type;
    const palette = type === 1 ? 0 : Math.floor(Math.random() * 5);
    this.bursts[i].set(at.x, at.y, at.z, now);
    this.kinds[i].set(type, palette, radius * (type === 1 ? 0.8 : 1), rise);
    this.flashAt = now + 1.05;
  }

  private flashAt = -100;

  update(now: number) {
    this.flash = now - this.flashAt;
    const any = this.bursts.some((b) => now - b.w < 7);
    this.mesh.visible = any;
  }

  /** 0..1 light from the latest break, for a subtle exposure lift. */
  light() {
    return this.flash >= 0 && this.flash < 1.2 ? Math.exp(-this.flash * 3.5) : 0;
  }
}
