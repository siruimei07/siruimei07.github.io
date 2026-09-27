import * as THREE from "three";
import { common } from "../engine/glsl";

// A school of light-fish (Tsukuyomi's neon sea life) living in view space, so
// it rides along with every camera move. Each fish swims from where it is to
// a point of the current emblem along a curved path, then mills around it.
// The path function exists twice — GLSL for drawing, JS for re-targeting mid
// swim — and the two must stay identical.

export type Emblem = "ring" | "leaf" | "σ" | "</>" | "moon" | "✉" | "gear" | "scatter";

const vert = /* glsl */ `
${common}
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec4 aSeed; // phase, speed, delay, size
uniform float uTime;
uniform float uStart;
uniform float uDur;
uniform float uScale;
uniform float uAlpha;
uniform mat4 uProj;
uniform vec3 uOffset;
uniform vec3 uCenter;   // formation centre (view space) for the spin
uniform float uSpin;    // rad/s around uCenter (0 = still)
varying vec2 vQ;
varying float vGlow;
varying float vHue;
varying float vFade;

vec3 orbit(float t, vec4 s) {
  float w = 1.1 + s.y * 1.3;
  float ph = s.x * 6.2832;
  float r = 0.09 + 0.08 * s.y;
  return r * vec3(cos(w * t + ph), sin(w * t + ph) * 0.62, sin(w * 0.7 * t + ph) * 0.4);
}

vec3 swim(float t) {
  float dur = uDur * (0.75 + 0.5 * aSeed.y);
  float k = clamp((t - uStart - aSeed.z * 0.45) / dur, 0.0, 1.0);
  float e = k * k * k * (k * (k * 6.0 - 15.0) + 10.0);
  vec3 d = aTo - aFrom;
  vec3 side = normalize(cross(d + vec3(1e-4, 0.0, 0.0), vec3(0.0, 0.0, 1.0)) + 1e-5);
  float amp = length(d) * (0.18 + 0.22 * aSeed.w) * (aSeed.x > 0.5 ? 1.0 : -1.0);
  vec3 p = mix(aFrom, aTo, e) + side * sin(3.14159 * e) * amp + orbit(t, aSeed) * e;
  // a formation can circulate around its centre (the ring around the moon)
  float ang = uSpin * (t - uStart) * e;
  vec2 r = p.xy - uCenter.xy;
  float c = cos(ang), s = sin(ang);
  p.xy = uCenter.xy + vec2(c * r.x - s * r.y, s * r.x + c * r.y);
  return p;
}

void main() {
  vec3 p = swim(uTime) + uOffset;
  vec3 p0 = swim(uTime - 0.06) + uOffset;
  vec2 vel = p.xy - p0.xy;
  float sp = length(vel);
  vec2 along = sp > 1e-5 ? vel / sp : vec2(1.0, 0.0);
  vec2 perp = vec2(-along.y, along.x);
  float size = uScale * (0.34 + 0.22 * aSeed.w);
  vQ = position.xy * 1.6;
  vec3 vp = p + vec3((along * position.x * 1.6 + perp * position.y * 0.8) * size, 0.0);
  gl_Position = uProj * vec4(vp, 1.0);
  vGlow = 0.7 + 0.3 * sin(uTime * (2.0 + aSeed.y * 3.0) + aSeed.x * 40.0);
  vHue = aSeed.w;
  vFade = uAlpha * smoothstep(-1.0, -4.0, p.z);
}`;

const frag = /* glsl */ `
${common}
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uGold;
varying vec2 vQ;
varying float vGlow;
varying float vHue;
varying float vFade;

void main() {
  // q.x: -1 tail … +1 head, q.y: -1 … 1 across (quad is 2:1)
  vec2 q = vQ;
  q.y += sin(q.x * 5.0 - uTime * 18.0) * 0.09 * (1.0 - q.x) ;
  // body: a pointed ellipse; tail: a forked fan
  float body = length(vec2((q.x - 0.15) / 0.78, q.y / 0.42));
  float tailX = clamp((-q.x - 0.45) / 0.5, 0.0, 1.0);
  float tail = step(-0.98, q.x) * step(q.x, -0.45) * step(abs(q.y), 0.12 + tailX * 0.72) * step(tailX * 0.35, abs(q.y) + 0.05);
  float inBody = smoothstep(1.0, 0.86, body);
  float rim = smoothstep(0.7, 0.9, body) * inBody;
  float a = max(inBody * 0.5 + rim * 0.85, tail * 0.7);
  // drawn after the grade (display space): a soft halo stands in for bloom
  float halo = exp(-max(body - 0.8, 0.0) * 3.2) * 0.22 * (1.0 - inBody);
  if (a + halo < 0.01) discard;
  vec3 c = mix(uColA, uColB, smoothstep(0.2, 0.9, vHue));
  if (vHue > 0.93) c = uGold;
  vec3 col = c * (a * vGlow) * 1.15 + vec3(1.0) * rim * 0.75 + c * halo;
  gl_FragColor = vec4(col * vFade, 1.0);
}`;

type Target = { x: number; y: number; z: number };

export class FishSchool {
  readonly mesh: THREE.Mesh;
  readonly count: number;
  private geo: THREE.InstancedBufferGeometry;
  private from: Float32Array;
  private to: Float32Array;
  private seeds: Float32Array;
  private mat: THREE.ShaderMaterial;
  private cache = new Map<Emblem, Target[]>();
  emblem: Emblem = "scatter";

  constructor(count: number) {
    this.count = count;
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute("position", quad.getAttribute("position"));
    this.from = new Float32Array(count * 3);
    this.to = new Float32Array(count * 3);
    this.seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      this.seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      const s = this.scatterPoint();
      this.from.set(s, i * 3);
      this.to.set(s, i * 3);
    }
    this.geo.setAttribute("aFrom", new THREE.InstancedBufferAttribute(this.from, 3));
    this.geo.setAttribute("aTo", new THREE.InstancedBufferAttribute(this.to, 3));
    this.geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(this.seeds, 4));
    this.geo.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uStart: { value: -10 },
        uDur: { value: 1.3 },
        uScale: { value: 0.5 },
        uAlpha: { value: 0 },
        uProj: { value: new THREE.Matrix4() },
        uOffset: { value: new THREE.Vector3() },
        uCenter: { value: new THREE.Vector3() },
        uSpin: { value: 0 },
        uColA: { value: new THREE.Color(0.55, 0.95, 1.0) },
        uColB: { value: new THREE.Color(0.9, 0.97, 1.0) },
        uGold: { value: new THREE.Color(1.0, 0.85, 0.45) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  set alpha(v: number) {
    this.mat.uniforms.uAlpha.value = v;
  }

  get alpha() {
    return this.mat.uniforms.uAlpha.value;
  }

  private scatterPoint(): [number, number, number] {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 40;
    return [Math.cos(a) * r, Math.sin(a) * r * 0.6, -40 - Math.random() * 40];
  }

  // JS twin of the GLSL swim() — used to snapshot positions when re-targeting.
  private swimAt(i: number, t: number, out: number[]) {
    const s = this.seeds.subarray(i * 4, i * 4 + 4);
    const u = this.mat.uniforms;
    const dur = u.uDur.value * (0.75 + 0.5 * s[1]);
    const k = Math.min(1, Math.max(0, (t - u.uStart.value - s[2] * 0.45) / dur));
    const e = k * k * k * (k * (k * 6 - 15) + 10);
    const fx = this.from[i * 3], fy = this.from[i * 3 + 1], fz = this.from[i * 3 + 2];
    const dx = this.to[i * 3] - fx, dy = this.to[i * 3 + 1] - fy, dz = this.to[i * 3 + 2] - fz;
    // side = normalize(cross(d + (1e-4,0,0), (0,0,1)))
    let sx = dy, sy = -(dx + 1e-4);
    const sl = Math.hypot(sx, sy) + 1e-5;
    sx /= sl;
    sy /= sl;
    const amp = Math.hypot(dx, dy, dz) * (0.18 + 0.22 * s[3]) * (s[0] > 0.5 ? 1 : -1);
    const b = Math.sin(Math.PI * e) * amp;
    const w = 1.1 + s[1] * 1.3;
    const ph = s[0] * Math.PI * 2;
    const r = 0.09 + 0.08 * s[1];
    out[0] = fx + dx * e + sx * b + r * Math.cos(w * t + ph) * e;
    out[1] = fy + dy * e + sy * b + r * Math.sin(w * t + ph) * 0.62 * e;
    out[2] = fz + dz * e + r * Math.sin(w * 0.7 * t + ph) * 0.4 * e;
    const ang = u.uSpin.value * (t - u.uStart.value) * e;
    const cx = u.uCenter.value.x;
    const cy = u.uCenter.value.y;
    const rx = out[0] - cx;
    const ry = out[1] - cy;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    out[0] = cx + c * rx - sn * ry;
    out[1] = cy + sn * rx + c * ry;
  }

  /**
   * Swim to an emblem. `place` maps emblem space (x, y in [-1, 1]) to view
   * space: the emblem's centre, its half-size in view units, and depth.
   */
  form(emblem: Emblem, t: number, place: { x: number; y: number; z: number; size: number }, dur = 1.3, spin = 0) {
    const pts = this.targets(emblem);
    const tmp = [0, 0, 0];
    const off = this.mat.uniforms.uOffset.value as THREE.Vector3;
    for (let i = 0; i < this.count; i++) {
      this.swimAt(i, t, tmp);
      this.from[i * 3] = tmp[0] + off.x;
      this.from[i * 3 + 1] = tmp[1] + off.y;
      this.from[i * 3 + 2] = tmp[2] + off.z;
      const p = pts[i % pts.length];
      this.to[i * 3] = place.x + p.x * place.size;
      this.to[i * 3 + 1] = place.y + p.y * place.size;
      this.to[i * 3 + 2] = place.z + p.z * place.size * 0.3;
    }
    off.set(0, 0, 0);
    const u = this.mat.uniforms;
    u.uStart.value = t;
    u.uDur.value = dur;
    u.uSpin.value = spin;
    u.uCenter.value.set(place.x, place.y, place.z);
    u.uScale.value = place.size * 0.042 + 0.25;
    (this.geo.getAttribute("aFrom") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aTo") as THREE.BufferAttribute).needsUpdate = true;
    this.emblem = emblem;
  }

  /** Fish live in their own fixed-fov view space, independent of the world camera. */
  static readonly FOV = 34;
  static readonly DEPTH = 50;
  private proj = new THREE.PerspectiveCamera(FishSchool.FOV, 1, 1, 400);

  /** View-space point at a screen position (NDC) on the emblem plane, and view units per NDC y. */
  at(ndcX: number, ndcY: number, depth = FishSchool.DEPTH) {
    const halfH = depth * Math.tan(THREE.MathUtils.degToRad(FishSchool.FOV / 2));
    return { x: ndcX * halfH * this.proj.aspect, y: ndcY * halfH, z: -depth, unit: halfH };
  }

  /** Slide the whole school (e.g. to keep the ring on the moon). */
  setOffset(x: number, y: number, z = 0) {
    (this.mat.uniforms.uOffset.value as THREE.Vector3).set(x, y, z);
  }

  resize(aspect: number) {
    this.proj.aspect = aspect;
    this.proj.updateProjectionMatrix();
    this.mat.uniforms.uProj.value.copy(this.proj.projectionMatrix);
  }

  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }

  private targets(e: Emblem): Target[] {
    const hit = this.cache.get(e);
    if (hit) return hit;
    const pts = e === "ring" ? ringPoints(this.count) : e === "scatter" ? scatterPoints(this.count) : samplePoints(drawEmblem(e), this.count);
    // shuffle so neighbouring fish get distant targets (prettier crossings)
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    this.cache.set(e, pts);
    return pts;
  }
}

function ringPoints(n: number): Target[] {
  const out: Target[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.02;
    const band = (Math.random() - 0.5) * 0.14;
    out.push({ x: Math.cos(a) * (1 + band), y: Math.sin(a) * (1 + band), z: (Math.random() - 0.5) * 0.4 });
  }
  return out;
}

function scatterPoints(n: number): Target[] {
  const out: Target[] = [];
  for (let i = 0; i < n; i++) out.push({ x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 2 });
  return out;
}

const S = 256;

function drawEmblem(e: Emblem): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineCap = "round";
  g.lineJoin = "round";
  const text = (t: string, font: string, dy = 0) => {
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(t, S / 2, S / 2 + dy);
  };
  switch (e) {
    case "leaf": {
      // 彩葉 — a coloured leaf: a pointed blade with a stem, the vein carved out
      g.save();
      g.translate(S * 0.5, S * 0.52);
      g.rotate(-0.5);
      g.beginPath();
      g.moveTo(0, -S * 0.42);
      g.bezierCurveTo(S * 0.3, -S * 0.26, S * 0.3, S * 0.2, 0, S * 0.34);
      g.bezierCurveTo(-S * 0.3, S * 0.2, -S * 0.3, -S * 0.26, 0, -S * 0.42);
      g.fill();
      g.lineWidth = S * 0.035;
      g.beginPath();
      g.moveTo(0, S * 0.3);
      g.quadraticCurveTo(S * 0.03, S * 0.42, -S * 0.02, S * 0.5);
      g.stroke();
      g.globalCompositeOperation = "destination-out";
      g.lineWidth = S * 0.028;
      g.beginPath();
      g.moveTo(0, S * 0.3);
      g.lineTo(0, -S * 0.34);
      g.stroke();
      for (const k of [-0.18, -0.04, 0.1, 0.22]) {
        for (const sd of [-1, 1]) {
          g.beginPath();
          g.moveTo(0, S * k);
          g.lineTo(sd * S * 0.17, S * (k - 0.1));
          g.stroke();
        }
      }
      g.restore();
      break;
    }
    case "</>":
      text("</>", `900 ${S * 0.46}px "Montserrat", sans-serif`, S * 0.02);
      break;
    case "σ": {
      // a bell curve with its area filled, and the axis
      g.beginPath();
      g.moveTo(S * 0.06, S * 0.8);
      for (let i = 0; i <= 80; i++) {
        const x = -3 + (6 * i) / 80;
        const y = Math.exp(-x * x / 2);
        g.lineTo(S * (0.06 + (0.88 * i) / 80), S * (0.8 - y * 0.62));
      }
      g.lineTo(S * 0.94, S * 0.8);
      g.closePath();
      g.globalAlpha = 0.55;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = S * 0.05;
      g.beginPath();
      g.moveTo(S * 0.04, S * 0.84);
      g.lineTo(S * 0.96, S * 0.84);
      g.stroke();
      g.lineWidth = S * 0.03;
      g.beginPath();
      g.moveTo(S * 0.5, S * 0.16);
      g.lineTo(S * 0.5, S * 0.84);
      g.stroke();
      break;
    }
    case "moon": {
      g.beginPath();
      g.arc(S * 0.45, S * 0.5, S * 0.36, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "destination-out";
      g.beginPath();
      g.arc(S * 0.6, S * 0.4, S * 0.31, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "source-over";
      for (const [x, y, r] of [
        [0.8, 0.72, 0.035],
        [0.88, 0.5, 0.025],
        [0.72, 0.86, 0.02],
      ])
        star(g, S * x, S * y, S * r);
      break;
    }
    case "✉": {
      g.lineWidth = S * 0.07;
      g.strokeRect(S * 0.12, S * 0.24, S * 0.76, S * 0.52);
      g.beginPath();
      g.moveTo(S * 0.14, S * 0.27);
      g.lineTo(S * 0.5, S * 0.56);
      g.lineTo(S * 0.86, S * 0.27);
      g.stroke();
      break;
    }
    case "gear": {
      const teeth = 9;
      g.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a0 = (i / (teeth * 2)) * Math.PI * 2;
        const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? S * 0.43 : S * 0.33;
        g.arc(S / 2, S / 2, r, a0, a1);
      }
      g.closePath();
      g.fill();
      g.globalCompositeOperation = "destination-out";
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.14, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "source-over";
      break;
    }
    default:
      break;
  }
  return g;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r * 2.2 : r * 0.6;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Blue-noise-ish sampling of the lit pixels (weighted by alpha). */
function samplePoints(g: CanvasRenderingContext2D, n: number): Target[] {
  const d = g.getImageData(0, 0, S, S).data;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && d[(y * S + x) * 4 + 3] > 128;
  // Outlines carry the shape (like a drone show): edge pixels are always
  // candidates, the interior only sparsely.
  const ring: [number, number][] = [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]];
  const cand: [number, number][] = [];
  for (let y = 0; y < S; y += 1)
    for (let x = 0; x < S; x += 1) {
      if (!inside(x, y)) continue;
      const edge = ring.some(([dx, dy]) => !inside(x + dx, y + dy));
      if (Math.random() < (edge ? 1 : 0.14)) cand.push([x, y]);
    }
  if (!cand.length) return scatterPoints(n);
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const minD = Math.max(1.2, Math.sqrt(cand.length / n) * 0.85);
  const cell = minD;
  const grid = new Map<string, [number, number][]>();
  const out: Target[] = [];
  for (const [x, y] of cand) {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let ok = true;
    for (let yy = cy - 1; yy <= cy + 1 && ok; yy++)
      for (let xx = cx - 1; xx <= cx + 1 && ok; xx++)
        for (const [px, py] of grid.get(`${xx},${yy}`) ?? []) if ((px - x) ** 2 + (py - y) ** 2 < minD * minD) ok = false;
    if (!ok) continue;
    const key = `${cx},${cy}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push([x, y]);
    out.push({ x: (x / S) * 2 - 1, y: -((y / S) * 2 - 1), z: (Math.random() - 0.5) * 0.5 });
    if (out.length >= n) break;
  }
  while (out.length < n) {
    const [x, y] = cand[Math.floor(Math.random() * cand.length)];
    out.push({ x: (x / S) * 2 - 1 + (Math.random() - 0.5) * 0.02, y: -((y / S) * 2 - 1), z: (Math.random() - 0.5) * 0.5 });
  }
  return out;
}
