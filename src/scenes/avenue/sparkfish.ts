import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";
import { rng } from "../common/util";

// A great light-fish drawn with a sparkler: hundreds of glittering points on
// its outline, fins, spine and ribs, bending along its route like a real body
// and shedding sparks that hang in the air behind it and fall away. The fish
// plane stays upright but turns toward the viewer so the drawing reads.

export type SparkFishOptions = {
  path: THREE.Vector3[];
  closed?: boolean;
  /** Body length (m). */
  length: number;
  speed: number;
  color: THREE.ColorRepresentation;
  accent?: THREE.ColorRepresentation;
  intensity?: number;
  /** 0…1 start position along the route. */
  phase?: number;
  /** Point radius (m). */
  point?: number;
  seed?: number;
  density?: number;
};

const vert = /* glsl */ `
${common}
precision highp float;
precision highp sampler2D;
uniform sampler2D tPath;
uniform float uN;
uniform float uLen;
uniform float uTime;
uniform float uSpeed;
uniform float uBody;
uniform float uPhase;
uniform float uTrail;
uniform float uPoint;
uniform float uPxAngle;
uniform vec3 uCol;
uniform vec3 uAccent;
attribute vec4 aP;   // x (−1 tail … 1 head), y (belly … back), jitter, kind (0 outline, 1 fin, 2 bone, 3 eye, 4 spark)
attribute vec4 aS;   // phase, brightness, size, colour mix
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;
varying float vStar;

vec3 pathAt(float s) {
  float f = fract(s) * uN;
  float i0 = floor(f);
  float fr = f - i0;
  vec3 a = texelFetch(tPath, ivec2(int(mod(i0, uN)), 0), 0).xyz;
  vec3 b = texelFetch(tPath, ivec2(int(mod(i0 + 1.0, uN)), 0), 0).xyz;
  return mix(a, b, fr);
}

void main() {
  float head = uPhase + uTime * uSpeed / uLen;
  float x = aP.x;
  float kind = aP.w;
  float along = (x - 1.0) * 0.5 * uBody;
  float age = 0.0;
  if (kind > 3.5) {
    // sparks stay where they were shed (they recycle at the tail)
    age = fract(uTime * uSpeed / uTrail + aS.x);
    along = -uBody - age * uTrail;
  }
  float s = head + along / uLen;
  vec3 c = pathAt(s);
  vec3 T = normalize(pathAt(s + 1.5 / uLen) - pathAt(s - 1.5 / uLen) + vec3(1e-5, 0.0, 0.0));
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 U = normalize(up - T * dot(up, T) + vec3(0.0, 1e-4, 0.0));
  vec3 toCam = normalize(cameraPosition - c);
  vec3 P = normalize(cross(T, toCam) + vec3(0.0, 1e-4, 0.0));
  float w = dot(P, U);
  vec3 S = normalize(U + P * w * 1.4);
  vec3 Z = normalize(cross(T, S));
  // swimming: a travelling wave that grows toward the tail
  float wave = sin(x * 2.6 - uTime * 2.4 + uPhase * 31.0) * 0.07 * uBody * pow(0.5 * (1.0 - x), 1.5);
  vec3 wp = c + S * (aP.y * uBody * 0.5) + Z * (wave + aP.z * uBody * 0.03);
  float bright = aS.y;
  if (kind > 3.5) {
    vec3 j = hash31(aS.x * 91.0 + floor(uTime * uSpeed / uTrail + aS.x) * 7.0) - 0.5;
    wp += (S * j.x + Z * j.y) * uBody * 0.35 * (0.3 + age) + j * age * 6.0;
    wp.y -= age * age * 14.0;
    bright *= (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.05, age);
  }
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  float depth = max(-vp.z, 0.01);
  float r = uPoint * aS.z;
  float minR = depth * uPxAngle * 1.3;
  float sz = max(r, minR);
  float energy = pow(r / sz, 1.2);
  // the bright ones get a four-point star (bigger quad)
  vStar = step(0.9, aS.y) * step(kind, 3.5);
  float quad = sz * (2.2 + vStar * 4.0);
  vp.xy += position.xy * quad;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy * (1.0 + vStar * 1.8);
  float tw = 0.55 + 0.45 * sin(uTime * (6.0 + aS.x * 9.0) + aS.x * 50.0);
  vCol = mix(uCol, uAccent, aS.w) * bright * energy * tw;
  vViewZ = depth - 1.0;
}`;

const frag = /* glsl */ `
${common}
${fxDepthTest}
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;
varying float vStar;

void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  vec2 q = vQ;
  float r = length(q);
  float core = smoothstep(0.46, 0.16, r);
  float halo = exp(-r * r * 5.0) * 0.45;
  float star = vStar * (exp(-abs(q.x) * 14.0) * exp(-abs(q.y) * 1.6) + exp(-abs(q.y) * 14.0) * exp(-abs(q.x) * 1.6)) * 0.9;
  float a = core + halo + star;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a * vis, 1.0);
}`;

/** Points of one fish drawing: [x, y, jitter, kind] + [phase, bright, size, accent]. */
function fishPoints(rand: () => number, density: number) {
  const P: number[] = [];
  const S: number[] = [];
  const add = (x: number, y: number, kind: number, bright: number, size: number, accent = 0) => {
    P.push(x, y, (rand() - 0.5) * 2, kind);
    S.push(rand(), bright * (0.75 + rand() * 0.5), size * (0.7 + rand() * 0.6), accent);
  };
  const top = (x: number) => 0.38 * Math.pow(Math.max(0, 1 - Math.pow((x - 0.18) / 0.82, 2)), 0.55);
  const bot = (x: number) => -0.3 * Math.pow(Math.max(0, 1 - Math.pow((x - 0.18) / 0.82, 2)), 0.6);
  const k = density;
  // outline of the body (from the tail stalk to the snout)
  const nO = Math.round(150 * k);
  for (let i = 0; i < nO; i++) {
    const x = -0.62 + (1.6 * i) / nO + (rand() - 0.5) * 0.01;
    add(x, top(Math.min(x, 0.999)), 0, rand() < 0.1 ? 1 : 0.8, 1, rand() < 0.2 ? 1 : 0);
    add(x, bot(Math.min(x, 0.999)), 0, rand() < 0.1 ? 1 : 0.8, 1, rand() < 0.2 ? 1 : 0);
  }
  // forked tail
  const nT = Math.round(46 * k);
  for (let i = 0; i < nT; i++) {
    const t = i / nT;
    for (const sg of [-1, 1]) {
      // outer edge: stalk → tip, inner edge: tip → notch
      add(-0.62 - t * 0.4, sg * (0.05 + t * 0.42), 1, 0.85, 1);
      add(-1.02 + t * 0.2, sg * (0.47 - t * 0.47), 1, 0.7, 0.9);
    }
  }
  // dorsal and pectoral fins
  const nF = Math.round(22 * k);
  for (let i = 0; i < nF; i++) {
    const t = i / nF;
    add(0.12 - t * 0.3, top(0.12 - t * 0.3) + Math.sin(t * Math.PI) * 0.22 + t * 0.04, 1, 0.8, 0.9, 1);
    add(0.46 - t * 0.28, -0.08 - Math.sin(t * Math.PI * 0.8) * 0.16 - t * 0.1, 1, 0.7, 0.8);
    add(-0.2 - t * 0.2, bot(-0.2 - t * 0.2) - Math.sin(t * Math.PI) * 0.1, 1, 0.6, 0.8);
  }
  // spine and ribs: the sparkler's bones
  const nS = Math.round(40 * k);
  for (let i = 0; i < nS; i++) add(-0.6 + (1.42 * i) / nS, 0.02, 2, 0.75, 0.85, 1);
  const ribs = 11;
  for (let r = 0; r < ribs; r++) {
    const x = -0.44 + (r / (ribs - 1)) * 0.95;
    const n = Math.round(7 * k) + 2;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      add(x - t * 0.06, top(x) * t * 0.92, 2, 0.55, 0.7);
      add(x - t * 0.05, bot(x) * t * 0.92, 2, 0.55, 0.7);
    }
  }
  // eye and a gill arc
  for (let i = 0; i < 6; i++) add(0.78 + (rand() - 0.5) * 0.03, 0.08 + (rand() - 0.5) * 0.03, 3, 1.3, 1.2, 1);
  for (let i = 0; i < 12; i++) {
    const a = -0.9 + (i / 11) * 1.8;
    add(0.6 + Math.cos(a) * 0.05 - 0.05, Math.sin(a) * 0.22, 2, 0.6, 0.8);
  }
  // loose glitter inside the body
  const nG = Math.round(70 * k);
  for (let i = 0; i < nG; i++) {
    const x = -0.55 + rand() * 1.45;
    const y = bot(x) + (top(x) - bot(x)) * rand();
    add(x, y, 2, 0.35 + rand() * 0.3, 0.6, rand() < 0.5 ? 1 : 0);
  }
  // sparks shed behind
  const nK = Math.round(260 * k);
  for (let i = 0; i < nK; i++) add(-1, (rand() - 0.5) * 0.3, 4, 0.9, 0.8, rand() < 0.4 ? 1 : 0);
  return { P, S };
}

export class SparkFish {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(o: SparkFishOptions) {
    const closed = o.closed ?? true;
    const curve = new THREE.CatmullRomCurve3(o.path, closed, "centripetal");
    const N = 256;
    const pts = curve.getSpacedPoints(closed ? N : N - 1).slice(0, N);
    const data = new Float32Array(N * 4);
    pts.forEach((p, i) => data.set([p.x, p.y, p.z, 1], i * 4));
    const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const { P, S } = fishPoints(rng(o.seed ?? 5), o.density ?? 1);
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("aP", new THREE.InstancedBufferAttribute(new Float32Array(P), 4));
    g.setAttribute("aS", new THREE.InstancedBufferAttribute(new Float32Array(S), 4));
    g.instanceCount = P.length / 4;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        ...fxShared,
        tPath: { value: tex },
        uN: { value: N },
        uLen: { value: curve.getLength() },
        uTime: env.uTime,
        uSpeed: { value: o.speed },
        uBody: { value: o.length },
        uPhase: { value: o.phase ?? 0 },
        uTrail: { value: o.length * 1.6 },
        uPoint: { value: o.point ?? 0.45 },
        uPxAngle: { value: 0.001 },
        uCol: { value: new THREE.Color(o.color).multiplyScalar(o.intensity ?? 5) },
        uAccent: { value: new THREE.Color(o.accent ?? o.color).multiplyScalar(o.intensity ?? 5) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }

  update(camera: THREE.PerspectiveCamera, heightPx: number) {
    this.mat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
  }
}
