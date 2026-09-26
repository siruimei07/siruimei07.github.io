import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";
import { mulberry32 } from "./layout";

// Schools of light-fish (场景1): each fish is a short glowing streak — its
// own recent trajectory — with a bright head and a tapering tail. Schools
// swim along closed loops through the city; within a school every fish has
// a slowly swirling offset, so the shoal breathes and twists as it turns.

const NP = 12; // control points per loop
const SEG = 7;

const vert = /* glsl */ `
${common}
attribute float aSeg;
attribute float aSide;
attribute vec4 iA; // school, along, side, up (offset in school frame)
attribute vec4 iB; // seed, size, hue, speed jitter
uniform vec3 uPts[${NP * 2}];
uniform vec4 uSchool[8]; // loop id, phase, speed (loops/s), spread
uniform vec4 uSchool2[8]; // lateral offset, vertical offset, length, width
uniform float uTime;
uniform vec2 uRes;
varying float vF;
varying float vAcross;
varying vec3 vCol;
varying float vA;

vec3 cr(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
  return 0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t);
}
vec3 loopPoint(int loopId, float u) {
  float f = fract(u) * ${NP}.0;
  int i = int(floor(f));
  float t = fract(f);
  int b = loopId * ${NP};
  vec3 p0 = uPts[b + (i + ${NP - 1}) % ${NP}];
  vec3 p1 = uPts[b + i];
  vec3 p2 = uPts[b + (i + 1) % ${NP}];
  vec3 p3 = uPts[b + (i + 2) % ${NP}];
  return cr(p0, p1, p2, p3, t);
}

vec3 fishPos(float time) {
  int s = int(iA.x + 0.5);
  vec4 S = uSchool[s];
  vec4 S2 = uSchool2[s];
  int loopId = int(S.x + 0.5);
  float u = S.y + time * S.z * (1.0 + iB.w * 0.04) + iA.y * S2.z * 0.0015;
  vec3 c = loopPoint(loopId, u);
  vec3 ahead = loopPoint(loopId, u + 0.004);
  vec3 fwd = normalize(ahead - c);
  vec3 side = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(side, fwd);
  // Swirl the cross-section; breathe.
  float ang = time * 0.06 + iA.y * 0.05 + iB.x * 6.0;
  vec2 cs = vec2(iA.z * S2.w, iA.w * S2.w * 0.5);
  cs = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * cs * (0.85 + 0.15 * sin(time * 0.7 + iB.x * 20.0));
  vec3 wig = vec3(sin(time * 1.9 + iB.x * 40.0), sin(time * 1.3 + iB.x * 17.0), 0.0) * 0.25;
  return c + side * (S2.x + cs.x + wig.x) + up * (S2.y + cs.y + wig.y) + fwd * iA.y * 0.0;
}

void main() {
  float f = aSeg / float(${SEG});
  float lag = f * 0.22 * iB.y;
  vec3 p = fishPos(uTime - lag);
  vec3 pn = fishPos(uTime - lag - 0.02);
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vec4 cn = projectionMatrix * viewMatrix * vec4(pn, 1.0);
  if (c.w < 0.3 || cn.w < 0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 a = c.xy / c.w * 0.5 * uRes;
  vec2 b = cn.xy / cn.w * 0.5 * uRes;
  vec2 t = normalize(a - b + vec2(1e-5, 0.0));
  vec2 n = vec2(-t.y, t.x);
  // Body width: fat just behind the head, thin tail.
  float body = sin(3.14159 * pow(1.0 - f, 0.7)) * 0.9 + 0.1;
  float wpx = max(0.7, 0.075 * iB.y * uRes.y * projectionMatrix[1][1] * 0.5 / c.w) * body;
  a += n * aSide * wpx;
  gl_Position = vec4(a / (0.5 * uRes) * c.w, c.z, c.w);
  vF = f;
  vAcross = aSide;
  float hue = iB.z;
  vec3 tint = hue < 0.55 ? vec3(0.62, 0.95, 1.0) : hue < 0.85 ? vec3(1.0, 0.72, 0.84) : vec3(0.72, 1.0, 0.78);
  vCol = mix(vec3(1.0, 0.98, 0.95), tint, smoothstep(0.0, 0.6, f));
  vA = (1.0 - f * 0.85) * clamp(30.0 / c.w, 0.25, 1.0);
}`;

const frag = /* glsl */ `
uniform float uAlpha;
varying float vF;
varying float vAcross;
varying vec3 vCol;
varying float vA;
void main() {
  float g = exp(-vAcross * vAcross * 2.2);
  float head = smoothstep(0.12, 0.0, vF) * 1.5;
  gl_FragColor = vec4(vCol * g * (vA + head) * uAlpha * 1.6, 1.0);
}`;

export type FishSchool = { loop: 0 | 1; phase: number; speed: number; lateral: number; vertical: number; length: number; width: number; count: number };

export class LightFish {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(loops: THREE.Vector3[][], schools: FishSchool[], scale: number) {
    const rng = mulberry32(17);
    const pts: THREE.Vector3[] = [];
    for (let l = 0; l < 2; l++) {
      const src = loops[l] ?? loops[0];
      const curve = new THREE.CatmullRomCurve3(src, true);
      for (let i = 0; i < NP; i++) pts.push(curve.getPointAt(i / NP));
    }
    const geo = new THREE.InstancedBufferGeometry();
    const seg: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      seg.push(i, i);
      side.push(-1, 1);
      if (i < SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(seg.length * 3).fill(0), 3));
    geo.setAttribute("aSeg", new THREE.Float32BufferAttribute(seg, 1));
    geo.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);
    const A: number[] = [];
    const B: number[] = [];
    schools.forEach((sc, s) => {
      const n = Math.round(sc.count * scale);
      for (let i = 0; i < n; i++) {
        // Gaussian-ish blob, elongated along the path.
        const g = () => (rng() + rng() + rng() - 1.5) / 1.5;
        A.push(s, g() * sc.length * 0.5, g(), g());
        B.push(rng(), 0.7 + rng() * 0.8, rng(), rng());
      }
    });
    geo.setAttribute("iA", new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
    geo.setAttribute("iB", new THREE.InstancedBufferAttribute(new Float32Array(B), 4));
    geo.instanceCount = A.length / 4;
    const s1 = Array.from({ length: 8 }, () => new THREE.Vector4());
    const s2 = Array.from({ length: 8 }, () => new THREE.Vector4());
    schools.forEach((sc, i) => {
      s1[i].set(sc.loop, sc.phase, sc.speed, 1);
      s2[i].set(sc.lateral, sc.vertical, sc.length, sc.width);
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uPts: { value: pts },
        uSchool: { value: s1 },
        uSchool2: { value: s2 },
        uTime: G.uTime,
        uRes: G.uRes,
        uAlpha: { value: 1 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
}
