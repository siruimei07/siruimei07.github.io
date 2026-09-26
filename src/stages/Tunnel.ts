import * as THREE from "three";
import { FullscreenPass, passMaterial } from "../engine/fsq";
import { common } from "../engine/glsl";
import type { Pipeline } from "../engine/Pipeline";
import { tunnelBgFrag } from "./tunnelShader";
import { mulberry32 } from "./WaterWorld";

// The warp that opens the site, replayed on the reference clip's clock.
// A full-screen background (tunnelShader) is drawn into an fx target; 3D
// layers fly toward the camera on top of it inside the MSAA scene target:
// dust (gold, later teal-white), hair-thin light fibres, glassy water sheets
// that crash in around 3.8–4.9 s, and droplets that refract the background.

const copyFrag = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = texture(tSrc, vUv); }`;

// Forward speed (m/s) on the clip clock; the tunnel background uses the same
// integral so particles and walls agree.
export function tunnelSpeed(T: number) {
  const s = THREE.MathUtils.smoothstep;
  let v = 2.0 + 6.0 * s(T, 0.7, 1.6);
  v += 20.0 * s(T, 1.5, 2.3);
  v += 6.0 * s(T, 3.6, 4.3);
  v *= 1.0 - 0.55 * s(T, 4.9, 5.35);
  return v;
}

const dustVert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iPos; // x, y, z0, seed
uniform float uTravel;
uniform float uSpeed;
uniform float uT;
uniform vec2 uRes;
varying vec2 vQ;
varying vec3 vCol;
varying float vA;
void main() {
  float len = 90.0;
  float z = mod(iPos.z + uTravel, len) - len;
  vec3 w = vec3(iPos.xy, z);
  // Motion blur: segment from where the mote was a moment ago.
  float blur = clamp(uSpeed * 0.018, 0.02, 0.9);
  vec3 w0 = w - vec3(0.0, 0.0, blur);
  vec4 c1 = projectionMatrix * viewMatrix * vec4(w, 1.0);
  vec4 c0 = projectionMatrix * viewMatrix * vec4(w0, 1.0);
  if (c1.w < 0.1 || c0.w < 0.1) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 s1 = c1.xy / c1.w * 0.5 * uRes;
  vec2 s0 = c0.xy / c0.w * 0.5 * uRes;
  vec2 d = s1 - s0;
  float L = length(d);
  vec2 t = L > 1e-3 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float size = (0.6 + iPos.w * 1.6) * clamp(6.0 / c1.w, 0.4, 3.0);
  float along = corner == 0.0 || corner == 3.0 ? 0.0 : 1.0;
  float side = corner < 2.0 ? -1.0 : 1.0;
  vec2 sp = mix(s0 - t * size, s1 + t * size, along) + n * side * size;
  vQ = vec2(along * 2.0 - 1.0, side);
  gl_Position = vec4(sp / (0.5 * uRes) * c1.w, c1.z, c1.w);
  float warm = 1.0 - smoothstep(1.4, 2.2, uT);
  vec3 gold = vec3(1.0, 0.72, 0.35);
  vec3 cool = mix(vec3(0.75, 0.95, 1.0), vec3(1.0, 0.9, 0.75), step(0.85, iPos.w));
  vCol = mix(cool, gold, warm);
  float fadeNear = smoothstep(0.3, 2.5, -z);
  float fadeFar = 1.0 - smoothstep(55.0, 88.0, -z);
  float tw = 0.6 + 0.4 * sin(uT * 13.0 + iPos.w * 60.0);
  // Energy spreads over the streak.
  vA = fadeNear * fadeFar * tw * (1.4 + 3.0 * pow(iPos.w, 6.0)) * size / (size + L * 0.35);
}`;

const dustFrag = /* glsl */ `
uniform float uAlpha;
varying vec2 vQ;
varying vec3 vCol;
varying float vA;
void main() {
  float d = vQ.y * vQ.y;
  float g = exp(-d * 3.5) * (1.0 - smoothstep(0.7, 1.0, abs(vQ.x)) * 0.5);
  gl_FragColor = vec4(vCol * g * vA * uAlpha, 1.0);
}`;

// Light fibres: thin ribbons along random 3D curves (hair / filaments).
const FIB_SEG = 20;
const fiberVert = /* glsl */ `
${common}
attribute float aSeg;
attribute float aSide;
attribute vec4 iA; // angle0, radius0, z0, length
attribute vec4 iB; // twist, dradius, seed, width
uniform float uTravel;
uniform float uT;
uniform vec2 uRes;
varying float vF;
varying float vAcross;
varying vec3 vCol;
varying float vA;
vec3 curve(float s) {
  float ang = iA.x + s * iB.x + sin(s * 6.0 + iB.z * 20.0 + uT * 1.5) * 0.25;
  float rad = iA.y + s * iB.y + sin(s * 9.0 + iB.z * 11.0) * 0.12;
  float z = iA.z + s * iA.w;
  return vec3(cos(ang) * rad, sin(ang) * rad, z);
}
void main() {
  float s = aSeg / float(${FIB_SEG});
  float len = 90.0;
  float shift = mod(iA.z + uTravel, len) - len - iA.z;
  vec3 p = curve(s) + vec3(0.0, 0.0, shift);
  vec3 pn = curve(s + 0.02) + vec3(0.0, 0.0, shift);
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vec4 cn = projectionMatrix * viewMatrix * vec4(pn, 1.0);
  if (c.w < 0.15 || cn.w < 0.15) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 a = c.xy / c.w * 0.5 * uRes;
  vec2 b = cn.xy / cn.w * 0.5 * uRes;
  vec2 t = normalize(b - a + vec2(1e-5, 0.0));
  vec2 n = vec2(-t.y, t.x);
  float w = iB.w * clamp(4.0 / c.w, 0.5, 2.5);
  a += n * aSide * w;
  gl_Position = vec4(a / (0.5 * uRes) * c.w, c.z, c.w);
  vF = s;
  vAcross = aSide;
  float warm = 1.0 - smoothstep(1.3, 2.1, uT);
  vCol = mix(vec3(0.7, 0.9, 0.92), vec3(1.0, 0.7, 0.38), warm);
  float z = p.z;
  vA = smoothstep(0.4, 3.0, -z) * (1.0 - smoothstep(50.0, 85.0, -z)) * pow(hash11(iB.z * 91.0), 2.0);
}`;
const fiberFrag = /* glsl */ `
uniform float uAlpha;
varying float vF;
varying float vAcross;
varying vec3 vCol;
varying float vA;
void main() {
  float g = exp(-vAcross * vAcross * 2.5) * smoothstep(0.0, 0.15, vF) * smoothstep(1.0, 0.8, vF);
  gl_FragColor = vec4(vCol * g * vA * uAlpha * 0.55, 1.0);
}`;

// Glassy water sheets: deforming curved ribbons that refract the background.
const sheetVert = /* glsl */ `
${common}
attribute vec4 iA; // angle centre, angular width, radius, z0
attribute vec4 iB; // length, seed, start time, speed
uniform float uT;
uniform float uTravel;
varying vec3 vWorld;
varying vec2 vUvS;
varying float vSeed;
varying float vLife;
void main() {
  float u = uv.x; // across
  float v = uv.y; // along
  float age = uT - iB.z;
  vLife = age;
  float ang = iA.x + (u - 0.5) * iA.y + sin(v * 3.0 + age * 2.0 + iB.y * 7.0) * 0.25;
  float rad = iA.z * (1.0 - age * 0.18) + sin(u * 6.0 + age * 5.0 + iB.y * 3.0) * 0.35 + sin(v * 7.0 - age * 6.0) * 0.25;
  rad = max(rad, 0.35);
  float z = iA.w + v * iB.x + age * iB.w;
  vec3 p = vec3(cos(ang) * rad, sin(ang) * rad, z);
  vWorld = p;
  vUvS = uv;
  vSeed = iB.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const sheetFrag = /* glsl */ `
${common}
uniform sampler2D tBg;
uniform vec2 uRes;
uniform float uT;
uniform vec3 uCamPos;
varying vec3 vWorld;
varying vec2 vUvS;
varying float vSeed;
varying float vLife;
void main() {
  if (vLife < 0.0) discard;
  // Torn edges: the sheet exists where a noise field is above a threshold
  // that rises with age, so sheets break apart into ragged shards.
  vec2 q = vUvS * vec2(3.5, 6.0) + vSeed * 13.0;
  float n = fbm2(q + vec2(0.0, vLife * 0.8), 4);
  float edge = smoothstep(0.0, 0.25, vUvS.x) * smoothstep(1.0, 0.75, vUvS.x) * smoothstep(0.0, 0.1, vUvS.y) * smoothstep(1.0, 0.8, vUvS.y);
  float th = 0.34 + vLife * 0.5 + max(0.0, uT - 4.95) * 0.9;
  float m = n * edge - th * 0.5;
  if (m < 0.0) discard;
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  // Ripples on the liquid surface: a bumpy normal gives many small, sharp glints.
  vec2 rq = vUvS * vec2(7.0, 12.0) + vSeed * 5.0 + vLife * vec2(0.6, 2.4);
  float h0 = fbm2(rq, 4);
  float hx = fbm2(rq + vec2(0.04, 0.0), 4);
  float hy = fbm2(rq + vec2(0.0, 0.04), 4);
  vec3 tx = normalize(cross(N, vec3(0.0, 0.0, 1.0)) + 1e-4);
  vec3 ty = cross(N, tx);
  N = normalize(N + (tx * (hx - h0) + ty * (hy - h0)) * 22.0);
  float ndv = abs(dot(N, V));
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 4.0);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 refr = texture(tBg, suv + N.xy * 0.07).rgb * vec3(0.6, 0.85, 0.88) * 0.95;
  vec3 R = reflect(-V, N);
  float s1 = pow(saturate(dot(R, normalize(vec3(0.0, 0.1, -1.0)))), 260.0) * 9.0;
  float s2 = pow(saturate(dot(R, normalize(vec3(-0.4, 0.8, -0.3)))), 90.0) * 2.5;
  float s3 = pow(saturate(dot(R, normalize(vec3(0.6, -0.3, -0.7)))), 160.0) * 3.0;
  vec3 env = vec3(0.02, 0.06, 0.065) + vec3(0.95, 0.98, 1.0) * (s1 + s2 + s3);
  float late = smoothstep(4.85, 5.2, uT);
  float rimE = smoothstep(mix(0.018, 0.04, late), 0.0, m) * mix(0.9, 2.6, late) * smoothstep(0.35, 0.75, fbm2(vUvS * vec2(14.0, 20.0) + vSeed * 3.0, 3));
  vec3 col = refr + env * fres * 1.2 + vec3(0.75, 0.92, 0.95) * rimE;
  gl_FragColor = vec4(col, 1.0);
}`;

// Droplets: little lenses that refract and catch highlights.
const dropVert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iP; // x, y, z, seed
attribute vec4 iV; // vx, vy, vz, size
uniform float uT;
uniform float uStart;
uniform vec2 uRes;
varying vec2 vQ;
varying float vA;
varying float vSeed;
void main() {
  float age = max(0.0, uT - uStart - iP.w * 0.35);
  vec3 p = iP.xyz + iV.xyz * age;
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (c.w < 0.12) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  float px = iV.w * uRes.y * projectionMatrix[1][1] * 0.5 / c.w;
  px = clamp(px, 1.5, 160.0);
  c.xy += q * px * 2.0 / uRes * c.w;
  gl_Position = c;
  vA = smoothstep(0.0, 0.15, age) * (uT > uStart ? 1.0 : 0.0);
  vSeed = iP.w;
}`;
const dropFrag = /* glsl */ `
${common}
uniform sampler2D tBg;
uniform vec2 uRes;
uniform float uAlpha;
varying vec2 vQ;
varying float vA;
varying float vSeed;
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  vec2 suv = gl_FragCoord.xy / uRes;
  float z = sqrt(1.0 - r * r);
  vec3 refr = texture(tBg, suv - vQ * 0.05 * (1.0 - z)).rgb;
  float rim = smoothstep(0.75, 1.0, r) * 0.35;
  float body = (1.0 - r * r) * 0.9;
  float spec = smoothstep(0.4, 0.05, length(vQ - vec2(-0.3, 0.35))) * 4.0;
  vec3 col = refr * 1.1 * vec3(0.7, 0.95, 0.95) + vec3(0.75, 0.9, 0.95) * (rim + body * 0.25) + vec3(1.0) * spec * 0.7;
  float edgeAA = smoothstep(1.0, 0.85, r);
  gl_FragColor = vec4(col * vA * uAlpha * edgeAA, edgeAA * vA * uAlpha);
}`;

function quadCorners(geo: THREE.InstancedBufferGeometry) {
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  geo.setAttribute("corner", new THREE.Float32BufferAttribute([0, 1, 2, 3], 1));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
}

export class Tunnel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 300);
  private bg: FullscreenPass;
  private copy: FullscreenPass;
  private dustMat: THREE.ShaderMaterial;
  private fiberMat: THREE.ShaderMaterial;
  private sheetMat: THREE.ShaderMaterial;
  private dropMat: THREE.ShaderMaterial;
  T = 0;
  travel = 0;
  private lastT = 0;
  private res = new THREE.Vector2(1, 1);

  constructor(particleScale = 1) {
    const rng = mulberry32(99);
    this.bg = new FullscreenPass(
      passMaterial(tunnelBgFrag, {
        uT: { value: 0 },
        uRes: { value: this.res },
        uCore: { value: new THREE.Vector2(0.52, 0.53) },
        uTravel: { value: 0 },
      }),
    );
    this.copy = new FullscreenPass(passMaterial(copyFrag, { tSrc: { value: null } }));

    // Dust.
    const nDust = Math.round(3200 * particleScale);
    const dg = new THREE.InstancedBufferGeometry();
    quadCorners(dg);
    const dp = new Float32Array(nDust * 4);
    for (let i = 0; i < nDust; i++) {
      const stream = i % 3 === 0 || i % 5 === 0;
      const a = stream ? -0.7 + (rng() - 0.5) * 1.1 : rng() * Math.PI * 2;
      const r = stream ? 0.15 + rng() * 1.4 : 0.25 + Math.pow(rng(), 0.7) * 7.5;
      dp.set([Math.cos(a) * r, Math.sin(a) * r, -rng() * 90, rng()], i * 4);
    }
    dg.setAttribute("iPos", new THREE.InstancedBufferAttribute(dp, 4));
    dg.instanceCount = nDust;
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      uniforms: { uTravel: { value: 0 }, uSpeed: { value: 0 }, uT: { value: 0 }, uRes: { value: this.res }, uAlpha: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const dust = new THREE.Mesh(dg, this.dustMat);
    dust.frustumCulled = false;
    dust.renderOrder = 3;

    // Fibres.
    const nFib = Math.round(140 * particleScale);
    const fg = new THREE.InstancedBufferGeometry();
    const seg: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= FIB_SEG; i++) {
      seg.push(i, i);
      side.push(-1, 1);
      if (i < FIB_SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    fg.setAttribute("position", new THREE.Float32BufferAttribute(new Array(seg.length * 3).fill(0), 3));
    fg.setAttribute("aSeg", new THREE.Float32BufferAttribute(seg, 1));
    fg.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
    fg.setIndex(idx);
    const fa = new Float32Array(nFib * 4);
    const fb = new Float32Array(nFib * 4);
    for (let i = 0; i < nFib; i++) {
      fa.set([rng() * Math.PI * 2, 0.6 + rng() * 4.5, -rng() * 90, 2 + rng() * 9], i * 4);
      fb.set([(rng() - 0.5) * 3.5, (rng() - 0.5) * 2.5, rng(), 0.55 + rng() * 0.9], i * 4);
    }
    fg.setAttribute("iA", new THREE.InstancedBufferAttribute(fa, 4));
    fg.setAttribute("iB", new THREE.InstancedBufferAttribute(fb, 4));
    fg.instanceCount = nFib;
    this.fiberMat = new THREE.ShaderMaterial({
      vertexShader: fiberVert,
      fragmentShader: fiberFrag,
      uniforms: { uTravel: { value: 0 }, uT: { value: 0 }, uRes: { value: this.res }, uAlpha: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const fibers = new THREE.Mesh(fg, this.fiberMat);
    fibers.frustumCulled = false;
    fibers.renderOrder = 2;

    // Water sheets.
    const sg = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1, 36, 24);
    sg.index = plane.index;
    sg.setAttribute("position", plane.getAttribute("position"));
    // PlaneGeometry uv: x across (0..1), y along (0..1).
    sg.setAttribute("uv", plane.getAttribute("uv"));
    const sheets = [
      // angle, width, radius, z0 | length, seed, start, speed
      [2.35, 2.1, 2.7, -17, 15, 0.13, 3.7, 6.0],
      [-0.75, 1.3, 2.3, -19, 12, 0.57, 3.98, 7.0],
      [4.1, 1.0, 1.6, -12, 9, 0.91, 4.22, 6.5],
      [0.9, 0.8, 1.5, -11, 7, 0.33, 4.36, 8.5],
      [3.3, 1.2, 1.25, -9, 8, 0.71, 4.48, 7.5],
      [5.4, 0.7, 1.9, -13, 9, 0.21, 4.6, 6.5],
      [-0.2, 0.9, 1.1, -8, 6, 0.44, 4.72, 9.0],
      [1.8, 0.6, 1.4, -7, 6, 0.66, 4.86, 9.0],
    ];
    const sa = new Float32Array(sheets.length * 4);
    const sb = new Float32Array(sheets.length * 4);
    sheets.forEach((s, i) => {
      sa.set(s.slice(0, 4), i * 4);
      sb.set(s.slice(4, 8), i * 4);
    });
    sg.setAttribute("iA", new THREE.InstancedBufferAttribute(sa, 4));
    sg.setAttribute("iB", new THREE.InstancedBufferAttribute(sb, 4));
    sg.instanceCount = sheets.length;
    this.sheetMat = new THREE.ShaderMaterial({
      vertexShader: sheetVert,
      fragmentShader: sheetFrag,
      uniforms: {
        tBg: { value: null },
        uRes: { value: this.res },
        uT: { value: 0 },
        uTravel: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
      },
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    });
    const sheetMesh = new THREE.Mesh(sg, this.sheetMat);
    sheetMesh.frustumCulled = false;
    sheetMesh.renderOrder = 1;

    // Droplets from the splash.
    const nDrop = Math.round(650 * particleScale);
    const pg = new THREE.InstancedBufferGeometry();
    quadCorners(pg);
    const pp = new Float32Array(nDrop * 4);
    const pv = new Float32Array(nDrop * 4);
    for (let i = 0; i < nDrop; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.3 + rng() * 2.5;
      pp.set([Math.cos(a) * r, Math.sin(a) * r, -4 - rng() * 22, rng()], i * 4);
      const out = 1.5 + rng() * 5;
      pv.set([Math.cos(a) * out, Math.sin(a) * out, 6 + rng() * 10, 0.006 + Math.pow(rng(), 5) * 0.07], i * 4);
    }
    pg.setAttribute("iP", new THREE.InstancedBufferAttribute(pp, 4));
    pg.setAttribute("iV", new THREE.InstancedBufferAttribute(pv, 4));
    pg.instanceCount = nDrop;
    this.dropMat = new THREE.ShaderMaterial({
      vertexShader: dropVert,
      fragmentShader: dropFrag,
      uniforms: { tBg: { value: null }, uRes: { value: this.res }, uT: { value: 0 }, uStart: { value: 4.3 }, uAlpha: { value: 1 } },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const drops = new THREE.Mesh(pg, this.dropMat);
    drops.frustumCulled = false;
    drops.renderOrder = 4;

    this.scene.add(sheetMesh, fibers, dust, drops);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.res.set(w, h);
  }

  /** Advance to clip time T (seconds). */
  setTime(T: number) {
    const dt = T - this.lastT;
    if (dt > 0 && dt < 0.5) {
      // Integrate speed so particles and walls stay in step.
      const steps = Math.max(1, Math.ceil(dt / 0.01));
      for (let i = 0; i < steps; i++) {
        const t = this.lastT + (dt * (i + 0.5)) / steps;
        this.travel += (tunnelSpeed(t) * dt) / steps;
      }
    } else if (dt !== 0) {
      // Jumped (seek / reset): recompute the integral from the start.
      this.travel = 0;
      for (let t = 0; t < T; t += 0.01) this.travel += tunnelSpeed(t) * Math.min(0.01, T - t);
    }
    this.lastT = T;
    this.T = T;
  }

  render(pl: Pipeline) {
    const r = pl.renderer;
    const T = this.T;
    // Camera: gentle drift + a little roll, like a handheld dive.
    const cam = this.camera;
    cam.position.set(Math.sin(T * 0.9) * 0.05, Math.cos(T * 1.1) * 0.04, 0);
    cam.rotation.set(Math.sin(T * 0.6) * 0.012, Math.cos(T * 0.5) * 0.015, Math.sin(T * 0.35) * 0.05 + T * 0.012);
    cam.updateMatrixWorld();

    const core = this.bg.material.uniforms.uCore.value as THREE.Vector2;
    // Core position drifts as in the clip (uv, y up).
    const s = THREE.MathUtils.smoothstep;
    core.set(0.54 - 0.03 * s(T, 0.8, 2.0) - 0.03 * s(T, 2.6, 3.2) + 0.02 * s(T, 5.0, 5.3), 0.55 - 0.03 * s(T, 1.0, 2.0) - 0.05 * s(T, 4.0, 5.0) + 0.05 * s(T, 5.1, 5.35));
    this.bg.material.uniforms.uT.value = T;
    this.bg.material.uniforms.uTravel.value = this.travel * 0.045;

    // Background into fx (readable later for refraction), then copy to the MSAA target.
    const bgTarget = pl.fxA;
    pl.timer.begin("tunnel-bg");
    this.bg.render(r, bgTarget);
    pl.timer.end();
    pl.timer.begin("tunnel-3d");
    r.setRenderTarget(pl.scene);
    r.clear(true, true, false);
    this.copy.material.uniforms.tSrc.value = bgTarget.texture;
    this.copy.render(r, pl.scene);
    const speed = tunnelSpeed(T);
    for (const m of [this.dustMat, this.fiberMat, this.sheetMat, this.dropMat]) {
      if (m.uniforms.uT) m.uniforms.uT.value = T;
      if (m.uniforms.uTravel) m.uniforms.uTravel.value = this.travel;
    }
    this.dustMat.uniforms.uSpeed.value = speed;
    this.dustMat.uniforms.uAlpha.value = s(T, 0.72, 0.95) * (1 - s(T, 5.05, 5.35));
    this.fiberMat.uniforms.uAlpha.value = (0.12 + 0.88 * s(T, 1.7, 2.5)) * s(T, 0.8, 1.1) * (1 - s(T, 4.8, 5.2));
    this.sheetMat.uniforms.tBg.value = bgTarget.texture;
    this.sheetMat.uniforms.uCamPos.value.copy(cam.position);
    this.dropMat.uniforms.tBg.value = bgTarget.texture;
    this.dropMat.uniforms.uAlpha.value = 1 - s(T, 5.3, 5.45);
    r.render(this.scene, cam);
    pl.timer.end();
    pl.current = pl.scene;
  }
}
