import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { camDist, groundY, LANTERN, MAIN_CAMS, moonCover, pathDist, SHRINE, segmentSeen, seen, STALK_X, STALK_Z } from "./layout";
import { stalkHueGlsl, swayGlsl } from "./shaders";

// The grove: hundreds of culms (nodes, a slight lean, a cool moon rim), each
// carrying drooping sprays of slender leaves that sway with it in the gusts,
// and a carpet of kumazasa (隈笹, white-edged bamboo grass) underneath.
// Near culms get real leaf geometry; further off the crowns are leaf cards
// (alpha-to-coverage cut-outs) and the culms get lighter geometry.

export type Culm = { x: number; y: number; z: number; h: number; r: number; lx: number; lz: number; seed: number; dCam: number };

/** Culms nearer than this (m, to the nearest main camera) get detailed geometry and leaf sprays. */
const NEAR = 24;

/** Smooth value noise in [0, 1] (deterministic). */
export function noise2(x: number, z: number): number {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = h(i, j);
  const b = h(i + 1, j);
  const c = h(i, j + 1);
  const d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const distToSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
};

export function placeCulms(density: number): Culm[] {
  const rand = rng(8000); // eight thousand years, give or take
  const culms: Culm[] = [];
  const cams = MAIN_CAMS.map((c) => c.position);
  const cell = 1.55;
  for (let gz = -160; gz < 36; gz += cell) {
    for (let gx = -120; gx < 140; gx += cell) {
      const x = gx + rand() * cell;
      const z = gz + rand() * cell;
      const r0 = rand();
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      const r4 = rand();
      const r5 = rand();
      // groves grow from rhizomes: patchy density, with misty gaps
      const patch = noise2(x * 0.08 + 3.1, z * 0.08 - 1.7) * 0.7 + noise2(x * 0.27, z * 0.27) * 0.3;
      let p = 0.12 + 0.78 * THREE.MathUtils.smoothstep(patch, 0.3, 0.72);
      const dCam = Math.min(...cams.map((c) => Math.hypot(x - c.x, z - c.z)));
      if (dCam < 2.4) continue;
      // fewer and fewer into the distance (the mist fills in)
      // sparse in the middle distance, a denser wall far off (soft in the mist)
      if (dCam > 22) p *= dCam < 46 ? Math.max(0.24, Math.pow(22 / dCam, 2)) : dCam < 72 ? 0.3 : 0.14;
      // calmer to the left of the screen shot (the panels sit there)
      const sc = cams[1];
      const azS = THREE.MathUtils.radToDeg(Math.atan2(x - sc.x, -(z - sc.z)));
      if (azS < 14) p *= dCam < 22 ? 0.4 : 0.6;
      // the clearing, the path, the shrine
      const dS = Math.hypot(x - STALK_X, z - STALK_Z);
      if (dS < 4.2) continue;
      if (dS < 9) p *= 0.3 + 0.7 * ((dS - 4.2) / 4.8) ** 2;
      const dP = pathDist(x, z);
      if (dP < 1.1) continue;
      if (dP < 2.0) p *= 0.45;
      if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 3.4) continue;
      if (Math.hypot(x - LANTERN.x, z - LANTERN.z) < 1.5) continue;
      // keep the line of sight from both cameras to the stalk open
      let blocked = false;
      for (const c of cams) {
        const s = distToSeg(x, z, c.x, c.z, STALK_X, STALK_Z);
        if (s.d < 0.6 + s.t * 0.8) blocked = true;
      }
      if (blocked) continue;
      if (r0 > p * (0.55 + 0.45 * density)) continue;
      const y = groundY(x, z);
      const h = 13.5 + r1 * 7 + (dS < 14 ? 1.5 : 0);
      if (!segmentSeen(x, y, z, h)) continue;
      const thick = r2 < 0.14;
      const r = (thick ? 0.08 + r3 * 0.035 : 0.042 + r3 * 0.042) * (dCam > 46 ? 1.35 : 1);
      // no culm across the moon (a few chosen ones are added below)
      if (moonCover(x, y, z, h * 1.02, r) < 1.5) continue;
      // lean a little, and toward the light of the clearing when near it
      let lx = (r4 - 0.5) * 0.05;
      let lz = (r5 - 0.5) * 0.05;
      if (dS < 14) {
        const k = (1 - dS / 14) * 0.04;
        lx += ((STALK_X - x) / dS) * k;
        lz += ((STALK_Z - z) / dS) * k;
      }
      culms.push({ x, y, z, h, r, lx, lz, seed: rand(), dCam });
    }
  }
  // Three thin culms that do cross the moon (from the screen shot), far and misty.
  const cam = MAIN_CAMS[1].position;
  for (const [dAz, dist, r] of [
    [-3.1, 30, 0.07],
    [2.4, 44, 0.06],
    [6.2, 25, 0.075],
  ] as const) {
    const az = THREE.MathUtils.degToRad(41 + dAz);
    const x = cam.x + Math.sin(az) * dist;
    const z = cam.z - Math.cos(az) * dist;
    const y = groundY(x, z);
    culms.push({ x, y, z, h: 24, r, lx: 0.004, lz: -0.006, seed: rand(), dCam: NEAR + 1 });
  }
  return culms.sort((a, b) => camDist(a.x, a.z) - camDist(b.x, b.z));
}

// ---------------------------------------------------------------------------
// Culms

const culmVertexHead = /* glsl */ `
attribute vec3 aCulm; // lean x, lean z, seed
varying float vBaseY;
varying float vSeed;
${swayGlsl}`;

const culmVertex = /* glsl */ `
  float t = uv.y;
  vec3 root = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float H = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
  vBaseY = root.y;
  vSeed = aCulm.z;
  wp.xz += aCulm.xy * t * t * H + culmSway(root.xz, t, aCulm.z) * H;`;

const culmFragmentHead = /* glsl */ `
uniform vec3 uStalk;
varying float vBaseY;
varying float vSeed;
${stalkHueGlsl}`;

const culmNodes = /* glsl */ `
  float y = vWorldPos.y - vBaseY;
  // nodes: a dark hairline with the pale waxy ring beneath it; internodes lengthen up the culm
  float sp = (0.26 + 0.1 * fract(vSeed * 7.13)) * (1.0 + 0.5 * smoothstep(0.0, 8.0, y));
  float u = y / sp;
  float f = fract(u);
  float w = fwidth(u);
  float detail = 1.0 - smoothstep(0.12, 0.3, w);
  float dn = min(f, 1.0 - f);
  float line = smoothstep(0.045 + w, 0.012, dn) * detail;
  float ring = smoothstep(0.84, 0.88, f) * smoothstep(0.985, 0.95, f) * detail;
  // darker at the foot, a little lighter up in the canopy light
  base *= mix(0.55, 1.05, smoothstep(0.0, 11.0, y));
  shade *= mix(0.75, 1.05, smoothstep(0.0, 11.0, y));
  base = mix(base, base * 1.2 + vec3(0.02, 0.03, 0.03), ring * 0.6);
  base = mix(base, base * 0.4, line); shade = mix(shade, shade * 0.5, line);`;

const culmFragment = /* glsl */ `
  ${culmNodes}
  // a painted highlight stripe down the moonlit side
  vec2 kh = normalize(uKeyDir.xz);
  float stripe = smoothstep(0.88, 0.94, dot(normalize(n.xz + 1e-5), kh));
  base += base * stripe * 0.3;
  // the shining stalk colours the culms around it, band by band
  vec2 toS = uStalk.xz - vWorldPos.xz;
  float dS = length(toS);
  if (dS < 11.0) {
    float facing = saturate(dot(n.xz, toS / max(dS, 1e-3)) * 0.8 + 0.2);
    float reach = 1.0 - dS / 11.0;
    float hy = vWorldPos.y - uStalk.y;
    float lv = reach * reach * facing * smoothstep(13.0, 1.0, hy);
    lv = floor(lv * 4.0 + 0.3) / 4.0;
    emis += hsv2rgb(vec3(stalkHueSmooth(hy), 0.75, 1.0)) * lv * 0.9;
  }`;

export function culmMaterial(stalk: THREE.Vector3, far: boolean) {
  return toonMaterial({
    color: far ? 0x3a6f70 : 0x3c7470,
    shade: far ? 0x0c1e2e : 0x091c29,
    ink: far ? 0 : 2,
    rim: far ? 0.0 : 0.75,
    step: 0.12,
    soft: 0.03,
    lights: far ? 0 : 1,
    uniforms: { uStalk: { value: stalk } },
    vertexHead: culmVertexHead,
    vertex: culmVertex,
    fragmentHead: culmFragmentHead,
    fragment: far ? culmNodes : culmFragment,
  });
}

export function buildCulms(culms: Culm[], stalk: THREE.Vector3): { near: THREE.Mesh; far: THREE.Mesh } {
  const make = (list: Culm[], radial: number, rows: number, far: boolean) => {
    const g = new THREE.CylinderGeometry(0.86, 1, 1, radial, rows, true);
    g.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(g, culmMaterial(stalk, far), list.length);
    const attr = new Float32Array(list.length * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    list.forEach((c, i) => {
      // sink the foot a little so it never floats on the slope
      m.compose(new THREE.Vector3(c.x, c.y - 0.15, c.z), q, new THREE.Vector3(c.r, c.h, c.r));
      mesh.setMatrixAt(i, m);
      attr.set([c.lx, c.lz, c.seed], i * 3);
      // young culms greener, old ones paler and yellower
      const age = c.seed;
      col.setRGB(0.92 + age * 0.14, 1.0 - age * 0.06, 0.95 - age * 0.22).multiplyScalar(0.86 + ((c.seed * 13.7) % 1) * 0.26);
      mesh.setColorAt(i, col);
    });
    g.setAttribute("aCulm", new THREE.InstancedBufferAttribute(attr, 3));
    mesh.frustumCulled = false;
    return mesh;
  };
  return {
    near: make(
      culms.filter((c) => c.dCam < NEAR),
      8,
      18,
      false,
    ),
    far: make(
      culms.filter((c) => c.dCam >= NEAR),
      5,
      3,
      true,
    ),
  };
}

// ---------------------------------------------------------------------------
// Leaf sprays (near): one drooping twig with clusters of slender leaves as
// real quads, alpha-to-coverage leaf outline.

export type SprayOpts = { clusters: number; perCluster: number; len: number; width: number; twig: number };

export const NEAR_SPRAY: SprayOpts = { clusters: 6, perCluster: 4, len: 0.3, width: 0.055, twig: 1.3 };

export function sprayGeometry(seed: number, o: SprayOpts): THREE.BufferGeometry {
  const rand = rng(seed);
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const leaf: number[] = [];
  const idx: number[] = [];
  const X = new THREE.Vector3(1, 0, 0);
  const d = new THREE.Vector3();
  const w = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const N = new THREE.Vector3();
  const P = new THREE.Vector3();
  let v = 0;
  for (let c = 0; c < o.clusters; c++) {
    const s = 0.3 + (0.7 * (c + 0.2 + rand() * 0.6)) / o.clusters;
    const tx = s * o.twig;
    const ty = -0.3 * o.twig * s * s;
    const tz = (rand() - 0.5) * 0.12 * o.twig;
    const phi = (rand() - 0.5) * 1.3; // fan plane tilt around the twig
    const Dp = new THREE.Vector3(0, -Math.cos(phi), Math.sin(phi));
    N.set(0, -Math.sin(phi), -Math.cos(phi));
    for (let k = 0; k < o.perCluster; k++) {
      const a = THREE.MathUtils.lerp(0.25, 1.75, (k + 0.5) / o.perCluster) + (rand() - 0.5) * 0.35;
      d.copy(X).multiplyScalar(Math.cos(a)).addScaledVector(Dp, Math.sin(a)).normalize();
      w.crossVectors(N, d).normalize();
      // twist each leaf a little out of the fan plane
      w.applyAxisAngle(d, (rand() - 0.5) * 1.1);
      nn.crossVectors(d, w).normalize();
      const len = o.len * (0.75 + rand() * 0.45);
      const hw = o.width * (0.8 + rand() * 0.4) * 0.5;
      const id = rand();
      for (let j = 0; j <= 1; j++) {
        P.set(tx, ty, tz).addScaledVector(d, len * j);
        P.y -= len * 0.18 * j; // leaves droop toward the tip
        for (const side of [-1, 1]) {
          pos.push(P.x + w.x * hw * side, P.y + w.y * hw * side, P.z + w.z * hw * side);
          nrm.push(nn.x, nn.y + 0.35, nn.z);
          uv.push(side < 0 ? 0 : 1, j);
          leaf.push(id);
        }
      }
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aLeaf", new THREE.Float32BufferAttribute(leaf, 1));
  g.setIndex(idx);
  return g;
}

const leafVertexHead = /* glsl */ `
attribute float aLeaf;
attribute vec4 aRoot;   // culm root x, z, height fraction, seed
attribute float aHeight;
varying float vLeaf;
${swayGlsl}`;

const leafVertex = /* glsl */ `
  vLeaf = aLeaf;
  wp.xz += culmSway(aRoot.xy, aRoot.z, aRoot.w) * aHeight;
  // each leaf flutters about its base, harder in a gust
  float gust = gustAt(aRoot.xy);
  float fl = sin(uTime * (4.0 + aLeaf * 3.0) + aLeaf * 40.0 + aRoot.w * 9.0) * (0.02 + 0.05 * gust);
  wp.xyz += nrm * fl * uv.y;`;

const leafFragmentHead = /* glsl */ `
varying float vLeaf;`;

// lanceolate leaf with a long point; crisp coverage edge for alpha-to-coverage
const leafFragment = /* glsl */ `
  float lx = abs(vUv.x - 0.5) * 2.0;
  float ly = vUv.y;
  float hw = pow(sin(3.14159 * pow(ly, 0.62)), 0.85) * (1.0 - 0.1 * ly);
  float edge = hw - lx;
  alpha = saturate(edge / max(fwidth(edge), 1e-4) + 0.5);
  if (alpha < 0.02) discard;
  float tone = 0.84 + 0.3 * fract(vLeaf * 7.31);
  base *= tone; shade *= mix(0.9, 1.1, fract(vLeaf * 3.7));
  // a paler midrib, and some old leaves yellowing at the tip
  base *= 1.0 + 0.15 * smoothstep(0.14, 0.0, lx) * smoothstep(0.95, 0.4, ly);
  float old = step(0.86, fract(vLeaf * 11.3)) * smoothstep(0.55, 0.95, ly);
  base = mix(base, vec3(0.5, 0.52, 0.36), old * 0.55);`;

export function leafMaterial(color: THREE.ColorRepresentation, shade: THREE.ColorRepresentation, ink: number) {
  return toonMaterial({
    color,
    shade,
    ink,
    rim: 0.55,
    step: 0.05,
    soft: 0.03,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    vertexHead: leafVertexHead,
    vertex: leafVertex,
    fragmentHead: leafFragmentHead,
    fragment: leafFragment,
  });
}

// Leaf cards (far crowns): a hanging curtain of leaf fans drawn in the
// fragment shader, two cells per fragment (its own and the one above).
const cardFragment = /* glsl */ `
  // card space in metres: x across (−1.2 … 1.2), y down from the twig line (0 … −1.9)
  vec2 p = vec2((vUv.x - 0.5) * 2.4, (vUv.y - 1.0) * 1.9);
  // an irregular crown outline
  float env = length(vec2(p.x / 1.2, (p.y + 0.85) / 0.95)) + (vnoise(p * 2.3 + vLeaf * 30.0) - 0.5) * 0.5;
  if (env > 1.05) discard;
  // one twig per cell with three leaves hanging from it (kept inside the cell)
  vec2 cellSz = vec2(0.36, 0.44);
  vec2 id = floor(p / cellSz);
  vec2 h = hash22(id + vLeaf * 17.0);
  if (h.x < 0.18) discard;
  vec2 twig = (id + vec2(0.5 + (h.y - 0.5) * 0.3, 0.94)) * cellSz;
  vec2 q = p - twig;
  float cover = 0.0;
  float tone = 1.0;
  for (int j = 0; j < 3; j++) {
    float a = -1.5708 + (float(j) - 1.0) * 0.48 + (h.x - 0.5) * 0.35;
    vec2 dir = vec2(cos(a), sin(a));
    float along = dot(q, dir);
    float across = abs(dot(q, vec2(-dir.y, dir.x)));
    float len = 0.3 + 0.1 * fract(h.y * 7.0 + float(j) * 0.37);
    float t = clamp(along / len, 0.0, 1.0);
    float hw = 0.078 * sqrt(t) * (1.0 - t) * step(0.0, along) * step(along, len);
    float c = saturate((hw - across) / max(fwidth(across), 1e-4) + 0.5);
    if (c > cover) { cover = c; tone = 0.85 + 0.3 * fract(h.x * 13.0 + float(j) * 0.29); }
  }
  alpha = cover;
  if (alpha < 0.02) discard;
  base *= tone; shade *= mix(0.95, 1.05, tone);`;

export function cardMaterial() {
  return toonMaterial({
    color: 0x3f7a66,
    shade: 0x0b2130,
    ink: 0,
    rim: 0.0,
    step: 0.05,
    soft: 0.03,
    lights: 0,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    vertexHead: /* glsl */ `
      attribute vec4 aRoot;
      attribute float aHeight;
      varying float vLeaf;
      ${swayGlsl}`,
    vertex: /* glsl */ `
      vLeaf = aRoot.w + aRoot.z * 3.1;
      wp.xz += culmSway(aRoot.xy, aRoot.z, aRoot.w) * aHeight;
      wp.xz += normalize(uWind.xz) * sin(uTime * 1.7 + aRoot.w * 30.0 + position.x) * 0.05 * (1.0 - uv.y) * gustAt(aRoot.xy);`,
    fragmentHead: /* glsl */ `varying float vLeaf;`,
    fragment: cardFragment,
  });
}

type Spray = { m: THREE.Matrix4; root: [number, number, number, number]; h: number; tone: number; d: number };

export function buildSprays(culms: Culm[], density: number): { near: THREE.Mesh; cards: THREE.Mesh } {
  const rand = rng(4242);
  const near: Spray[] = [];
  const cards: Spray[] = [];
  const q = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const P = new THREE.Vector3();
  for (const c of culms) {
    const isNear = c.dCam < NEAR * 0.85;
    const n = isNear
      ? Math.round((18 + rand() * 8) * (0.6 + 0.4 * density))
      : Math.round((c.dCam < 46 ? 5.5 + rand() * 2.5 : c.dCam < 72 ? 3 + rand() * 2 : 1.5 + rand() * 1.5) * (0.7 + 0.3 * density));
    for (let j = 0; j < n; j++) {
      const t = isNear ? 0.42 + Math.pow(rand(), 0.75) * 0.58 : 0.5 + Math.pow(rand(), 0.7) * 0.5;
      const lean = t * t * c.h;
      P.set(c.x + c.lx * lean, c.y + c.h * t, c.z + c.lz * lean);
      if (!seen(P, 0.35, 0.9)) continue;
      // no leaves over the moon's face (a ragged edge of them frames it)
      if (moonCover(P.x, P.y - (isNear ? 1.0 : 1.9), P.z, isNear ? 1.6 : 2.4, isNear ? 0.9 : 1.3) < 1.05 + rand() * 0.25) continue;
      const yaw = rand() * Math.PI * 2;
      if (isNear) {
        const tilt = 0.15 + rand() * 0.5 - t * 0.2;
        q.setFromAxisAngle(up, yaw).multiply(qa.setFromAxisAngle(zAxis, tilt));
      } else {
        // cards hang from the culm like curtains, tipped outward
        q.setFromAxisAngle(up, yaw).multiply(qa.setFromAxisAngle(xAxis, -(0.25 + rand() * 0.6)));
      }
      const s = isNear ? (0.85 + rand() * 0.5) * (0.8 + t * 0.4) : (1.1 + rand() * 0.6) * (0.75 + c.dCam / 110);
      const m = new THREE.Matrix4().compose(P.clone(), q.clone(), new THREE.Vector3(s, s, s));
      (isNear ? near : cards).push({ m, root: [c.x, c.z, t, c.seed], h: c.h, tone: rand(), d: camDist(P.x, P.z) });
    }
  }
  const make = (list: Spray[], geo: THREE.BufferGeometry, mat: THREE.Material) => {
    list.sort((a, b) => a.d - b.d);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const root = new Float32Array(list.length * 4);
    const hh = new Float32Array(list.length);
    const col = new THREE.Color();
    list.forEach((s, i) => {
      mesh.setMatrixAt(i, s.m);
      root.set(s.root, i * 4);
      hh[i] = s.h;
      col.setRGB(0.9 + s.tone * 0.2, 0.95 + s.tone * 0.1, 0.9 + (1 - s.tone) * 0.15);
      mesh.setColorAt(i, col);
    });
    geo.setAttribute("aRoot", new THREE.InstancedBufferAttribute(root, 4));
    geo.setAttribute("aHeight", new THREE.InstancedBufferAttribute(hh, 1));
    mesh.frustumCulled = false;
    return mesh;
  };
  const card = new THREE.PlaneGeometry(2.4, 1.9);
  card.translate(0, -0.95, 0);
  card.scale(1.25, 1.25, 1.25);
  return { near: make(near, sprayGeometry(11, NEAR_SPRAY), leafMaterial(0x4a8a70, 0x0a2330, 4)), cards: make(cards, card, cardMaterial()) };
}

// ---------------------------------------------------------------------------
// Kumazasa: a clump of stems, each with a whorl of broad white-edged leaves.

function sasaGeometry(seed: number): THREE.BufferGeometry {
  const rand = rng(seed);
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const leaf: number[] = [];
  const lift: number[] = [];
  const idx: number[] = [];
  let v = 0;
  const d = new THREE.Vector3();
  const w = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const stems = 4;
  for (let s = 0; s < stems; s++) {
    const sx = (rand() - 0.5) * 0.5;
    const sz = (rand() - 0.5) * 0.5;
    const top = 0.32 + rand() * 0.45; // whorl height (m, before instance scale)
    // stem strip (thin, from the ground to the whorl)
    pos.push(sx - 0.006, 0, sz, sx + 0.006, 0, sz, sx - 0.006, top, sz, sx + 0.006, top, sz);
    for (let k = 0; k < 4; k++) {
      nrm.push(0, 0.3, 1);
      leaf.push(-1);
      lift.push(k < 2 ? 0 : 1);
    }
    uv.push(0.45, 0, 0.55, 0, 0.45, 1, 0.55, 1);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
    const n = 6 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.7;
      const drop = 0.05 + rand() * 0.4; // radians below horizontal
      d.set(Math.cos(az) * Math.cos(drop), -Math.sin(drop) + 0.1, Math.sin(az) * Math.cos(drop)).normalize();
      w.set(-Math.sin(az), 0, Math.cos(az));
      w.applyAxisAngle(d, (rand() - 0.5) * 0.6);
      nn.crossVectors(w, d).normalize();
      if (nn.y < 0) nn.negate();
      const len = 0.24 + rand() * 0.1;
      const hw = 0.032 + rand() * 0.01;
      const id = rand();
      for (let j = 0; j <= 1; j++) {
        const px = sx + d.x * len * j;
        const py = top + d.y * len * j - len * 0.12 * j;
        const pz = sz + d.z * len * j;
        for (const side of [-1, 1]) {
          pos.push(px + w.x * hw * side, py + w.y * hw * side, pz + w.z * hw * side);
          nrm.push(nn.x, nn.y, nn.z);
          uv.push(side < 0 ? 0 : 1, j);
          leaf.push(id);
          lift.push(1);
        }
      }
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aLeaf", new THREE.Float32BufferAttribute(leaf, 1));
  g.setAttribute("aLift", new THREE.Float32BufferAttribute(lift, 1));
  g.setIndex(idx);
  return g;
}

export function buildSasa(density: number): THREE.Object3D {
  const rand = rng(1996);
  const cams = MAIN_CAMS.map((c) => c.position);
  type Plant = { x: number; y: number; z: number; s: number; yaw: number };
  const plants: Plant[] = [];
  const P = new THREE.Vector3();
  const tries = Math.round(30000 * (0.5 + 0.5 * density));
  for (let i = 0; i < tries; i++) {
    const x = -36 + rand() * 80;
    const z = -56 + rand() * 80;
    const dCam = Math.min(...cams.map((c) => Math.hypot(x - c.x, z - c.z)));
    if (dCam > 36 || dCam < 1.0) continue;
    const clump = noise2(x * 0.3 + 7.0, z * 0.3 - 2.0) * 0.75 + noise2(x * 1.1, z * 1.1) * 0.25;
    const dS = Math.hypot(x - STALK_X, z - STALK_Z);
    const dP = pathDist(x, z);
    let p = THREE.MathUtils.smoothstep(clump, 0.3, 0.62);
    // thicker at the clearing's rim and along the path, never on the stones
    p *= 0.6 + 0.5 * Math.exp(-Math.pow((dS - 4.5) / 2.0, 2)) + 0.4 * Math.exp(-Math.pow((dP - 1.4) / 0.7, 2));
    // sparser far away (the litter shader carries it)
    p *= dCam > 12 ? Math.pow(12 / dCam, 1.4) : 1;
    if (dP < 0.6 || dS < 1.3) continue;
    if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 1.6 || Math.hypot(x - LANTERN.x, z - LANTERN.z) < 0.8) continue;
    // keep the view to the stalk's foot, the shrine and the lantern open
    let hidden = false;
    for (const c of cams) {
      for (const [tx, tz, r] of [
        [STALK_X, STALK_Z, 1.0],
        [SHRINE.x, SHRINE.z, 1.3],
        [LANTERN.x, LANTERN.z, 0.8],
      ] as const) {
        const sg = distToSeg(x, z, c.x, c.z, tx, tz);
        const toT = Math.hypot(x - tx, z - tz);
        if (sg.d < r * (0.5 + sg.t) && toT < 9) hidden = true;
      }
    }
    if (hidden) continue;
    if (rand() > p) continue;
    const y = groundY(x, z);
    const sc = (0.75 + rand() * 0.4) * (dCam < 4 ? 0.7 : 1);
    P.set(x, y + sc * 0.7, z);
    if (!seen(P, 0.25, 0.7)) continue;
    plants.push({ x, y, z, s: sc, yaw: rand() * Math.PI * 2 });
  }
  plants.sort((a, b) => camDist(a.x, a.z) - camDist(b.x, b.z));
  const geo = sasaGeometry(77);
  const mesh = new THREE.InstancedMesh(
    geo,
    toonMaterial({
      color: 0x3a755a,
      shade: 0x0a222b,
      ink: 12,
      rim: 0.7,
      step: 0.1,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      vertexHead: /* glsl */ `
        attribute float aLeaf;
        attribute float aLift;
        attribute vec2 aSasa; // clump scale, seed
        varying float vLeaf;
        ${swayGlsl}`,
      vertex: /* glsl */ `
        vLeaf = aLeaf;
        vec2 root = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        wp.xz += culmSway(root, 1.0, aSasa.y) * aSasa.x * 5.0 * aLift * position.y;
        float fl = sin(uTime * (3.0 + aLeaf * 2.0) + aLeaf * 30.0 + aSasa.y * 20.0) * 0.012 * (0.4 + gustAt(root));
        if (aLeaf >= 0.0) wp.xyz += nrm * fl * uv.y;`,
      fragmentHead: /* glsl */ `varying float vLeaf;`,
      fragment: /* glsl */ `
        if (vLeaf >= 0.0) {
          float lx = abs(vUv.x - 0.5) * 2.0;
          float ly = vUv.y;
          float hw = pow(sin(3.14159 * pow(ly, 0.72)), 0.65);
          float edge = hw - lx;
          alpha = saturate(edge / max(fwidth(edge), 1e-4) + 0.5);
          if (alpha < 0.02) discard;
          // the withered white margin (隈) that names the plant
          float kuma = smoothstep(0.34, 0.2, edge) * smoothstep(0.15, 0.45, ly);
          base = mix(base, vec3(0.5, 0.56, 0.52), kuma * 0.7);
          shade = mix(shade, vec3(0.2, 0.25, 0.36), kuma * 0.75);
          base *= 0.86 + 0.28 * fract(vLeaf * 5.3);
        } else {
          base *= 0.7; shade *= 0.8;
        }`,
    }),
    plants.length,
  );
  const sasa = new Float32Array(plants.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  plants.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yaw);
    m.compose(new THREE.Vector3(p.x, p.y - 0.02, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    mesh.setMatrixAt(i, m);
    sasa.set([p.s, rand()], i * 2);
  });
  geo.setAttribute("aSasa", new THREE.InstancedBufferAttribute(sasa, 2));
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// The far grove as one painted wall in the mist: faint culm verticals and a
// ragged canopy line, following the ground, so no sky shows at eye level.

export function buildBackdrop(): THREE.Mesh {
  const cams = MAIN_CAMS.map((c) => c.position);
  const cx = (cams[0].x + cams[1].x) / 2;
  const cz = (cams[0].z + cams[1].z) / 2;
  const R = 112;
  const seg = 120;
  const a0 = THREE.MathUtils.degToRad(-85);
  const a1 = THREE.MathUtils.degToRad(130);
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const x = cx + Math.sin(a) * R;
    const z = cz - Math.cos(a) * R;
    const y = groundY(x, z);
    pos.push(x, y - 3, z, x, y + 40, z);
    uv.push(a * R, -3, a * R, 40);
    nrm.push(-Math.sin(a), 0, Math.cos(a), -Math.sin(a), 0, Math.cos(a));
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(
    g,
    toonMaterial({
      color: 0x28506a,
      shade: 0x28506a,
      ink: 0,
      rim: 0,
      lights: 0,
      fog: 0.55,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      fragment: /* glsl */ `
        float along = vUv.x;
        float hgt = vUv.y;
        float top = 21.0 + 9.0 * fbm2(vec2(along * 0.012, 1.3), 3) + 3.0 * (vnoise(vec2(along * 0.15, 4.0)) - 0.5);
        float leafy = (fbm2(vec2(along * 0.7, hgt * 0.7), 2) - 0.5) * 3.2;
        float edge = top + leafy - hgt;
        alpha = saturate(edge / max(fwidth(edge), 1e-3) + 0.5);
        if (alpha < 0.02) discard;
        // culm verticals in three misty layers
        float cul = 0.0;
        for (int k = 0; k < 3; k++) {
          float sp = 0.55 + float(k) * 0.35;
          float c = floor(along / sp + float(k) * 0.37);
          float h = hash11(c * 1.37 + float(k) * 11.0);
          float fx = fract(along / sp + float(k) * 0.37) - 0.5 - (h - 0.5) * 0.6;
          float w = (0.05 + 0.06 * h) / sp;
          cul = max(cul, step(abs(fx), w) * step(0.3, h) * (1.0 - float(k) * 0.28));
        }
        float canopy = smoothstep(top - 11.0, top - 4.0, hgt + leafy);
        // moonlit mist: brightest low down and toward the moon, the far crowns a shade darker
        vec3 dir = normalize(vWorldPos - cameraPosition);
        float toMoon = pow(saturate(dot(dir, uMoonDir) * 0.5 + 0.5), 5.0);
        vec3 mist = mix(vec3(0.07, 0.15, 0.32), vec3(0.14, 0.24, 0.46), toMoon);
        mist *= mix(1.25, 0.85, smoothstep(0.0, 18.0, hgt));
        base = mix(mist, mist * 0.72, cul * (1.0 - canopy * 0.7));
        base = mix(base, mist * 0.62, canopy);
        shade = base;`,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// A few old leaves let go of the canopy and tumble down through the clearing.

export function buildFallingLeaves(density: number): THREE.Mesh {
  const rand = rng(1234);
  const n = Math.round(34 * (0.5 + 0.5 * density));
  const quad = new THREE.PlaneGeometry(0.05, 0.26, 1, 1);
  const mesh = new THREE.InstancedMesh(
    quad,
    toonMaterial({
      color: 0x93a06e,
      shade: 0x2b3448,
      ink: 13,
      rim: 0.8,
      step: 0.0,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      vertexHead: /* glsl */ `
        attribute vec4 aFall; // top height, period, phase, spin
        mat3 rotAxis(vec3 a, float r) {
          float s = sin(r), c = cos(r), oc = 1.0 - c;
          return mat3(oc * a.x * a.x + c, oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
                      oc * a.x * a.y - a.z * s, oc * a.y * a.y + c, oc * a.y * a.z + a.x * s,
                      oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
        }`,
      vertex: /* glsl */ `
        vec3 col = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float ph = fract(uTime / aFall.y + aFall.z);
        float fall = aFall.x - col.y;
        vec3 c = col + vec3(0.0, aFall.x - col.y - ph * fall, 0.0);
        // drift with the wind, flutter side to side
        vec2 wd = normalize(uWind.xz);
        c.xz += wd * ph * 2.5 + vec2(-wd.y, wd.x) * sin(uTime * 1.3 + aFall.z * 20.0) * 0.45;
        float r = uTime * aFall.w + aFall.z * 30.0;
        mat3 R = rotAxis(normalize(vec3(sin(aFall.z * 9.0), 0.6, cos(aFall.z * 7.0))), r) * rotAxis(vec3(0.0, 0.0, 1.0), sin(uTime * 2.1 + aFall.z * 11.0) * 0.8);
        float grow = smoothstep(0.0, 0.04, ph) * smoothstep(1.0, 0.95, ph);
        wp = vec4(c + R * (position * grow), 1.0);
        nrm = normalize(R * normal);`,
      fragment: /* glsl */ `
        float lx = abs(vUv.x - 0.5) * 2.0;
        float ly = vUv.y;
        float hw = pow(sin(3.14159 * pow(ly, 0.62)), 0.85);
        float edge = hw - lx;
        alpha = saturate(edge / max(fwidth(edge), 1e-4) + 0.5);
        if (alpha < 0.02) discard;`,
    }),
    n,
  );
  const fall = new Float32Array(n * 4);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    // columns around the clearing, in front of the mist and the stalk's light
    const a = rand() * Math.PI * 2;
    const r = 1.2 + rand() * 9;
    const x = STALK_X + Math.cos(a) * r - 1.5;
    const z = STALK_Z + Math.sin(a) * r * 0.8 - 2.0;
    const y = groundY(x, z) + 0.02;
    m.makeTranslation(x, y, z);
    mesh.setMatrixAt(i, m);
    fall.set([y + 9 + rand() * 6, 11 + rand() * 9, rand(), (rand() < 0.5 ? -1 : 1) * (1.2 + rand() * 2.2)], i * 4);
  }
  quad.setAttribute("aFall", new THREE.InstancedBufferAttribute(fall, 4));
  mesh.frustumCulled = false;
  return mesh;
}
