import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";
import { LANDMARKS, MESA, type Building } from "./layout";

// Instanced architecture for the city: wall bodies (with procedural windows
// that glow warm at night) and curved hip roofs with upturned eaves. The
// pagoda and the castle keep are stacks of the same parts.

// kind: 0 machiya · 1 hall · 2 tower · 3 pagoda tier · 4 castle tier · 5 castle base
type Part = { x: number; y: number; z: number; w: number; d: number; h: number; rot: number; kind: number; seed: number };
type RoofPart = { x: number; y: number; z: number; w: number; d: number; h: number; rot: number; kind: number; seed: number };

function roofGeometry() {
  // Hip roof over the unit footprint [-0.5, 0.5]², height 1. Each slope is a
  // strip from the eave (t = 0) to the ridge (t = 1) with a concave profile;
  // the eave corners lift (sori). Ridge runs along x.
  const pos: number[] = [];
  const idx: number[] = [];
  const up: number[] = [];
  const S = 10; // steps along the slope
  const A = 12; // steps along the eave
  const ridge = 0.3; // half-length of the ridge relative to the half-width
  const addSlope = (corner: (a: number, t: number) => [number, number, number]) => {
    const base = pos.length / 3;
    for (let i = 0; i <= S; i++) {
      const t = i / S;
      for (let j = 0; j <= A; j++) {
        const a = j / A;
        const [x, y, z] = corner(a, t);
        pos.push(x, y, z);
        up.push(t);
      }
    }
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < A; j++) {
        const p = base + i * (A + 1) + j;
        idx.push(p, p + A + 1, p + 1, p + 1, p + A + 1, p + A + 2);
      }
    }
  };
  const prof = (t: number) => Math.pow(t, 1.6); // concave slope
  const lift = (a: number, t: number) => 0.18 * Math.pow(Math.abs(a * 2 - 1), 3) * (1 - t) * (1 - t);
  // Long sides (z = ±0.5 → ridge z = 0).
  for (const s of [-1, 1]) {
    addSlope((a, t) => {
      const xe = (a - 0.5) * 1.0; // eave x
      const xr = (a - 0.5) * 2 * ridge * 0.5; // ridge x
      const x = THREE.MathUtils.lerp(xe, xr, t);
      const z = s * 0.5 * (1 - t);
      return [x, prof(t) + lift(a, t), z * (s > 0 ? 1 : 1)];
    });
  }
  // Hip ends (x = ±0.5 → ridge end).
  for (const s of [-1, 1]) {
    addSlope((a, t) => {
      const ze = (a - 0.5) * 1.0;
      const x = s * THREE.MathUtils.lerp(0.5, ridge * 0.5, t);
      const z = ze * (1 - t);
      return [x, prof(t) + lift(a, t), z];
    });
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("slopeT", new THREE.Float32BufferAttribute(up, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function bodyGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = g.index;
  geo.setAttribute("position", g.getAttribute("position"));
  geo.setAttribute("normal", g.getAttribute("normal"));
  return geo;
}

const bodyVert = /* glsl */ `
attribute vec4 iPos;  // x, y, z, rot
attribute vec4 iSize; // w, h, d, kind
attribute float iSeed;
varying vec3 vWorld;
varying vec3 vLocal;   // metres, from the building's base corner
varying vec3 vNormal;
varying float vKind;
varying float vSeed;
varying vec3 vSize;
void main() {
  vec3 p = position * iSize.xyz;
  float c = cos(iPos.w), s = sin(iPos.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  vec3 n = normal;
  n.xz = mat2(c, -s, s, c) * n.xz;
  vec3 w = p + iPos.xyz;
  vWorld = w;
  vLocal = (position + vec3(0.5, 0.0, 0.5)) * iSize.xyz;
  vNormal = n;
  vKind = iSize.w;
  vSeed = iSeed;
  vSize = iSize.xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const bodyFrag = /* glsl */ `
${common}
uniform vec3 uCamPos;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uFogColor;
uniform float uFogDist;
uniform float uLights;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNormal;
varying float vKind;
varying float vSeed;
varying vec3 vSize;

// Filtered window mask: 1 inside a pane. Fades to its average when the
// pattern gets smaller than a pixel so distant buildings don't sparkle.
float windows(vec2 q, vec2 cell, vec2 pane, out vec2 id, out float fw) {
  vec2 g = q / cell;
  id = floor(g);
  vec2 f = fract(g);
  vec2 lo = (1.0 - pane) * 0.5;
  vec2 m = smoothstep(lo - 0.04, lo + 0.04, f) * (1.0 - smoothstep(1.0 - lo - 0.04, 1.0 - lo + 0.04, f));
  fw = max(fwidth(g.x), fwidth(g.y));
  float avg = pane.x * pane.y;
  return mix(m.x * m.y, avg, smoothstep(0.25, 0.7, fw));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  float kind = vKind;
  // Coordinate across the facade (metres) and up.
  vec2 q = vec2(abs(N.x) > 0.5 ? vLocal.z : vLocal.x, vLocal.y);
  float isRoofTop = step(0.5, N.y);
  vec3 wall;
  vec3 emit = vec3(0.0);
  vec2 id;
  float fw;
  float warm = 0.0;
  if (kind < 0.5 || kind > 2.5 && kind < 4.5) {
    // Machiya / pagoda / castle tiers: dark timber frame, paper windows.
    bool plaster = kind > 3.5;
    wall = plaster ? vec3(0.36, 0.34, 0.31) : vec3(0.05, 0.032, 0.024);
    float floorH = kind > 2.5 ? vSize.y : 3.6;
    float m = windows(q - vec2(0.0, 0.8), vec2(1.9, floorH), vec2(0.78, 0.5), id, fw);
    float lit = step(0.28, hash12(id + vSeed * 91.0));
    float flick = 0.9 + 0.1 * sin(uTime * 2.0 + hash12(id) * 30.0);
    vec3 paper = mix(vec3(1.0, 0.6, 0.26), vec3(1.0, 0.78, 0.45), hash12(id + 3.0));
    warm = m * lit;
    emit = paper * warm * 2.4 * flick;
    // Vertical timber lines.
    float timber = smoothstep(0.92, 0.98, abs(fract(q.x / 0.95) * 2.0 - 1.0)) * (1.0 - smoothstep(0.25, 0.7, fwidth(q.x / 0.95)));
    wall *= 1.0 - timber * 0.5;
  } else if (kind < 1.5) {
    // Temple hall: vermilion columns, lattice glowing from inside.
    float col = step(0.8, fract(q.x / 3.2));
    wall = mix(vec3(0.07, 0.05, 0.04), vec3(0.42, 0.06, 0.035), col);
    float lat = windows(q - vec2(0.0, 0.6), vec2(3.2, vSize.y), vec2(0.72, 0.72), id, fw);
    warm = lat * (1.0 - col);
    emit = vec3(1.0, 0.62, 0.3) * warm * 1.6;
  } else if (kind < 2.5) {
    // Tower: dark curtain wall, many windows; a few floors in cool white.
    wall = vec3(0.03, 0.035, 0.045);
    float m = windows(q, vec2(3.1, 3.4), vec2(0.7, 0.55), id, fw);
    float r = hash12(id + vSeed * 57.0);
    float lit = step(0.52, r);
    vec3 c = mix(vec3(1.0, 0.72, 0.42), vec3(0.95, 0.9, 0.82), step(0.85, hash12(id.yy + vSeed)));
    warm = m * lit;
    emit = c * warm * 1.9;
  } else {
    // Castle base: fitted stone.
    wall = vec3(0.12, 0.12, 0.13);
    float courses = smoothstep(0.9, 1.0, fract(q.y / 1.2)) + smoothstep(0.93, 1.0, fract(q.x / 2.1 + floor(q.y / 1.2) * 0.5));
    wall *= 1.0 - 0.3 * saturate(courses);
  }
  if (isRoofTop > 0.5) { wall = vec3(0.03); emit = vec3(0.0); }
  vec3 amb = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);
  float ndl = saturate(dot(N, uMoonDir));
  vec3 col = wall * (amb * 1.2 + uMoonColor * ndl * 1.6);
  // Warm light spilling onto the facade from the windows.
  col += wall * vec3(1.0, 0.55, 0.25) * 0.35 * uLights;
  col += emit * uLights;
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist / uFogDist);
  col = mix(col, uFogColor, fog * 0.8);
  // Lights survive the haze a little better than walls.
  col += emit * uLights * fog * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

const roofVert = /* glsl */ `
attribute vec4 iPos;
attribute vec4 iSize; // w, h, d, kind
attribute float iSeed;
attribute float slopeT;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vT;
varying float vKind;
void main() {
  vec3 p = position * iSize.xyz;
  float c = cos(iPos.w), s = sin(iPos.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  vec3 n = normal / iSize.xyz;
  n.xz = mat2(c, -s, s, c) * n.xz;
  vec3 w = p + iPos.xyz;
  vWorld = w;
  vNormal = normalize(n);
  vT = slopeT;
  vKind = iSize.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const roofFrag = /* glsl */ `
${common}
uniform vec3 uCamPos;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uFogColor;
uniform float uFogDist;
uniform float uLights;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vT;
varying float vKind;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorld);
  // Kawara tiles: dark blue-grey with rows along the slope.
  vec3 tile = vec3(0.045, 0.05, 0.062);
  if (vKind > 3.5 && vKind < 4.5) tile = vec3(0.06, 0.075, 0.08); // castle: greened copper
  float rows = smoothstep(0.0, 0.25, abs(fract(vT * 18.0) - 0.5)) ;
  tile *= 0.8 + 0.2 * rows;
  vec3 amb = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);
  float ndl = saturate(dot(N, uMoonDir));
  vec3 col = tile * (amb * 1.3 + uMoonColor * ndl * 2.0);
  // Moonlit sheen on the glazed tiles.
  vec3 H = normalize(V + uMoonDir);
  col += uMoonColor * pow(saturate(dot(N, H)), 40.0) * 0.5;
  // The underside of the eaves catches the warm light of the street.
  float under = saturate(-N.y);
  col += vec3(1.0, 0.5, 0.22) * under * 0.22 * uLights;
  // Eave edge: a thin lit line.
  col += vec3(1.0, 0.6, 0.3) * smoothstep(0.04, 0.0, vT) * 0.25 * uLights;
  float dist = length(uCamPos - vWorld);
  col = mix(col, uFogColor, (1.0 - exp(-dist / uFogDist)) * 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;

function sharedUniforms() {
  return {
    uCamPos: G.uCamPos,
    uMoonDir: G.uMoonDir,
    uMoonColor: G.uMoonColor,
    uAmbTop: G.uAmbTop,
    uAmbBottom: G.uAmbBottom,
    uFogColor: G.uFogColor,
    uFogDist: { value: 1400 },
    uLights: { value: 1 },
    uTime: G.uTime,
  };
}

export class CityBuildings {
  readonly bodies: THREE.Mesh;
  readonly roofs: THREE.Mesh;
  readonly spire: THREE.Mesh;
  readonly bodyMat: THREE.ShaderMaterial;
  readonly roofMat: THREE.ShaderMaterial;

  constructor(list: Building[]) {
    const parts: Part[] = [];
    const roofs: RoofPart[] = [];
    for (const b of list) {
      parts.push({ x: b.x, y: b.y - 2, z: b.z, w: b.w, d: b.d, h: b.h + 2, rot: b.rot, kind: b.kind, seed: b.seed });
      if (b.kind !== 2) {
        const over = b.kind === 1 ? 3.2 : 1.6;
        roofs.push({ x: b.x, y: b.y + b.h, z: b.z, w: b.w + over * 2, d: b.d + over * 2, h: b.roof, rot: b.rot, kind: b.kind, seed: b.seed });
      } else {
        // Tower crown: a slim hip roof, like a modern pagoda cap.
        roofs.push({ x: b.x, y: b.y + b.h, z: b.z, w: b.w * 0.9, d: b.d * 0.9, h: 3, rot: 0, kind: 2, seed: b.seed });
      }
    }
    // Five-storey pagoda.
    const pg = LANDMARKS.pagoda;
    let y = pg.y;
    parts.push({ x: pg.x, y: y - 1, z: pg.z, w: 15, d: 15, h: 2.5, rot: 0.2, kind: 5, seed: 0.3 });
    y += 1.5;
    for (let i = 0; i < 5; i++) {
      const w = 11 - i * 1.3;
      const h = i === 0 ? 6.2 : 4.6;
      parts.push({ x: pg.x, y, z: pg.z, w, d: w, h, rot: 0.2, kind: 3, seed: 0.1 * i });
      roofs.push({ x: pg.x, y: y + h - 0.2, z: pg.z, w: w + 6.5 - i * 0.4, d: w + 6.5 - i * 0.4, h: 2.4, rot: 0.2, kind: 3, seed: 0.1 * i });
      y += h + 0.9;
    }
    const spireBase = y + 1.2;
    // Great hall.
    const hl = LANDMARKS.hall;
    parts.push({ x: hl.x, y: hl.y - 1, z: hl.z, w: 44, d: 32, h: 3, rot: -0.1, kind: 5, seed: 0.5 });
    parts.push({ x: hl.x, y: hl.y + 2, z: hl.z, w: 34, d: 22, h: 10, rot: -0.1, kind: 1, seed: 0.6 });
    roofs.push({ x: hl.x, y: hl.y + 11.8, z: hl.z, w: 46, d: 33, h: 12, rot: -0.1, kind: 1, seed: 0.6 });
    // Castle keep on the mesa.
    const cs = LANDMARKS.castle;
    const top = MESA.h;
    parts.push({ x: cs.x, y: top - 1, z: cs.z, w: 38, d: 32, h: 10, rot: 0, kind: 5, seed: 0.7 });
    let cy = top + 9;
    for (let i = 0; i < 4; i++) {
      const w = 28 - i * 5;
      const d = 22 - i * 3.6;
      const h = 5.2;
      parts.push({ x: cs.x, y: cy, z: cs.z, w, d, h, rot: 0, kind: 4, seed: 0.2 * i });
      roofs.push({ x: cs.x, y: cy + h - 0.2, z: cs.z, w: w + 5, d: d + 5, h: i === 3 ? 5 : 2.6, rot: 0, kind: 4, seed: 0.2 * i });
      cy += h + 1.4;
    }

    // Bodies.
    const bg = bodyGeometry();
    const n = parts.length;
    const ip = new Float32Array(n * 4);
    const is = new Float32Array(n * 4);
    const ie = new Float32Array(n);
    parts.forEach((p, i) => {
      ip.set([p.x, p.y, p.z, p.rot], i * 4);
      is.set([p.w, p.h, p.d, p.kind], i * 4);
      ie[i] = p.seed;
    });
    bg.setAttribute("iPos", new THREE.InstancedBufferAttribute(ip, 4));
    bg.setAttribute("iSize", new THREE.InstancedBufferAttribute(is, 4));
    bg.setAttribute("iSeed", new THREE.InstancedBufferAttribute(ie, 1));
    bg.instanceCount = n;
    this.bodyMat = new THREE.ShaderMaterial({ vertexShader: bodyVert, fragmentShader: bodyFrag, uniforms: sharedUniforms() });
    this.bodies = new THREE.Mesh(bg, this.bodyMat);
    this.bodies.frustumCulled = false;

    // Roofs.
    const rg = roofGeometry();
    const m = roofs.length;
    const rp = new Float32Array(m * 4);
    const rs = new Float32Array(m * 4);
    const re = new Float32Array(m);
    roofs.forEach((p, i) => {
      rp.set([p.x, p.y, p.z, p.rot], i * 4);
      rs.set([p.w, p.h, p.d, p.kind], i * 4);
      re[i] = p.seed;
    });
    rg.setAttribute("iPos", new THREE.InstancedBufferAttribute(rp, 4));
    rg.setAttribute("iSize", new THREE.InstancedBufferAttribute(rs, 4));
    rg.setAttribute("iSeed", new THREE.InstancedBufferAttribute(re, 1));
    rg.instanceCount = m;
    this.roofMat = new THREE.ShaderMaterial({ vertexShader: roofVert, fragmentShader: roofFrag, uniforms: sharedUniforms(), side: THREE.DoubleSide });
    this.roofs = new THREE.Mesh(rg, this.roofMat);
    this.roofs.frustumCulled = false;

    // Pagoda spire (sōrin): a bronze mast with nine rings.
    const sg = new THREE.CylinderGeometry(0.25, 0.35, 14, 8);
    sg.translate(0, 7, 0);
    for (let i = 0; i < 9; i++) {
      const ring = new THREE.TorusGeometry(0.9 - i * 0.04, 0.12, 6, 16);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, 2 + i * 1.1, 0);
      sg.copy(mergeTwo(sg, ring));
    }
    this.spire = new THREE.Mesh(
      sg,
      new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 uMoonDir; uniform vec3 uMoonColor; uniform vec3 uAmbTop; varying vec3 vN; varying vec3 vW; void main(){ vec3 N = normalize(vN); vec3 c = vec3(0.12,0.1,0.06) * (uAmbTop + uMoonColor * max(dot(N,uMoonDir),0.0) * 2.0) + vec3(1.0,0.6,0.3)*0.04; gl_FragColor = vec4(c,1.0); }`,
        uniforms: { uMoonDir: G.uMoonDir, uMoonColor: G.uMoonColor, uAmbTop: G.uAmbTop },
      }),
    );
    this.spire.position.set(pg.x, spireBase, pg.z);
  }

  set lights(v: number) {
    this.bodyMat.uniforms.uLights.value = v;
    this.roofMat.uniforms.uLights.value = v;
  }
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const ai = a.index ? a.toNonIndexed() : a;
  const bi = b.index ? b.toNonIndexed() : b;
  const pos = new Float32Array(ai.getAttribute("position").array.length + bi.getAttribute("position").array.length);
  pos.set(ai.getAttribute("position").array as Float32Array, 0);
  pos.set(bi.getAttribute("position").array as Float32Array, ai.getAttribute("position").array.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
