import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { landSlope, landY, MESA, mesaMask } from "./layout";

// Tsukuyomi below the stage: the valley floor and its far slope carpeted with
// lights (warm lanterns near, blue-violet far), thousands of lit buildings,
// Kyoto temple roofs and pagodas among towers, the table mountain with the
// shrine on its top, and far ridges fading into the night.

const D2R = Math.PI / 180;

/** Give every part the attributes the others have, then merge (non-indexed). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    return g;
  });
  const out = mergeGeometries(list);
  if (!out) throw new Error("merge failed");
  return out;
}

export const unitBox = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
};

/** A hipped roof tier: eave square (half a) → ridge square (half b), height h, with upturned corners. */
export function hipRoof(a: number, b: number, h: number, lift = 0.12, thick = 0.06): THREE.BufferGeometry {
  const up = (x: number, z: number) => lift * a * Math.pow((Math.abs(x) * Math.abs(z)) / (a * a), 1.5);
  const P: number[] = [];
  const quad = (p0: number[], p1: number[], p2: number[], p3: number[]) => P.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  const c = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = c[i];
    const [x1, z1] = c[(i + 1) % 4];
    const e0 = [x0 * a, up(x0 * a, z0 * a) + thick, z0 * a];
    const e1 = [x1 * a, up(x1 * a, z1 * a) + thick, z1 * a];
    const r0 = [x0 * b, h, z0 * b];
    const r1 = [x1 * b, h, z1 * b];
    // outer slope (winding so the normal faces out/up)
    quad(e1, e0, r0, r1);
    // eave fascia
    const f0 = [x0 * a, up(x0 * a, z0 * a), z0 * a];
    const f1 = [x1 * a, up(x1 * a, z1 * a), z1 * a];
    quad(f0, e0, e1, f1);
    // soffit toward the body (underside)
    const s0 = [x0 * b * 0.9, h * 0.25, z0 * b * 0.9];
    const s1 = [x1 * b * 0.9, h * 0.25, z1 * b * 0.9];
    quad(f1, s1, s0, f0);
  }
  // ridge cap
  quad([-b, h, b], [b, h, b], [b, h, -b], [-b, h, -b]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

/** Five-storey pagoda (unit: 1 = total height ≈ 1), bodies and roofs as separate geometries. */
function pagodaGeometry(): { body: THREE.BufferGeometry; roof: THREE.BufferGeometry } {
  const bodies: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const base = unitBox();
  base.scale(0.3, 0.035, 0.3);
  bodies.push(base);
  let y = 0.035;
  for (let i = 0; i < 5; i++) {
    const w = 0.19 - i * 0.02;
    const bh = 0.078 - i * 0.004;
    const b = unitBox();
    b.scale(w, bh, w);
    b.translate(0, y, 0);
    bodies.push(b);
    y += bh;
    const r = hipRoof(w * 1.7, w * 0.4, 0.04, 0.6, 0.008);
    r.translate(0, y - 0.01, 0);
    roofs.push(r);
    y += 0.036;
  }
  const spire = new THREE.CylinderGeometry(0.008, 0.016, 0.24, 6);
  spire.translate(0, y + 0.12, 0);
  bodies.push(spire);
  for (let k = 0; k < 5; k++) {
    const ring = new THREE.CylinderGeometry(0.02, 0.02, 0.008, 8);
    ring.translate(0, y + 0.04 + k * 0.03, 0);
    bodies.push(ring);
  }
  return { body: merge(bodies), roof: merge(roofs) };
}

/** Temple hall: body + a big hipped roof (unit footprint 1 × 1). */
function hallGeometry(): { body: THREE.BufferGeometry; roof: THREE.BufferGeometry } {
  const b = unitBox();
  b.scale(1, 0.55, 0.62);
  const r = hipRoof(0.72, 0.3, 0.42, 0.1, 0.04);
  r.scale(1, 1, 0.72);
  r.translate(0, 0.52, 0);
  return { body: merge([b]), roof: merge([r]) };
}

type Lot = { x: number; y: number; z: number; w: number; d: number; h: number; rot: number; kind: number };

/** Five-storey pagodas standing out of the town: azimuth (deg), distance, height. */
const PAGODAS: [number, number, number][] = [
  [-33, 560, 96],
  [-11, 1100, 110],
  [21, 1500, 120],
  [52, 780, 100],
  [70, 1350, 110],
  [-57, 1300, 105],
  [8, 2600, 150],
  [42, 2150, 130],
];
const PAGODA_XZ = PAGODAS.map(([az, d]) => [Math.sin(az * D2R) * d, -Math.cos(az * D2R) * d]);
const nearPagoda = (x: number, z: number, r: number) => PAGODA_XZ.some(([px, pz]) => Math.hypot(x - px, z - pz) < r);

function place(rand: () => number, density: number): Lot[] {
  const lots: Lot[] = [];
  const tryLot = (x: number, z: number, w: number, dd: number, h: number, kind: number) => {
    const d = Math.hypot(x, z);
    if (d < 150) return;
    if (mesaMask(x, z, 90) > 0.001) return;
    if (nearPagoda(x, z, 60 + d * 0.03)) return;
    if (landSlope(x, z) > 0.42) return;
    lots.push({ x, y: landY(x, z), z, w, d: dd, h, rot: (rand() - 0.5) * 0.5, kind });
  };
  // the general city: area-uniform in an annulus, fewer where it is far
  const N = Math.round(7200 * density);
  for (let i = 0; i < N; i++) {
    const az = (-88 + rand() * 215) * D2R;
    const d = Math.sqrt(THREE.MathUtils.lerp(170 * 170, 5200 * 5200, rand()));
    const x = Math.sin(az) * d;
    const z = -Math.cos(az) * d;
    const far = THREE.MathUtils.smoothstep(d, 800, 4000);
    const w = 14 + rand() * 22 + far * 18;
    const h = 10 + Math.pow(rand(), 2.2) * 55 + far * 10;
    tryLot(x, z, w, 12 + rand() * 20 + far * 14, h, 0);
  }
  // downtowns: towers
  const downs = [
    { az: -17, d: 1450, r: 330, n: 70, hmax: 230 },
    { az: 62, d: 2050, r: 420, n: 60, hmax: 260 },
    { az: 5, d: 2750, r: 460, n: 55, hmax: 200 },
    { az: -48, d: 2600, r: 380, n: 36, hmax: 170 },
  ];
  for (const c of downs) {
    for (let i = 0; i < Math.round(c.n * (0.6 + 0.4 * density)); i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * c.r;
      const cx = Math.sin(c.az * D2R) * c.d;
      const cz = -Math.cos(c.az * D2R) * c.d;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const core = 1 - rr / c.r;
      const h = 60 + (c.hmax - 60) * core * (0.45 + 0.55 * rand());
      const w = 26 + rand() * 26;
      tryLot(x, z, w, w * (0.7 + rand() * 0.5), h, 1);
    }
  }
  return lots;
}

export type CityResult = { group: THREE.Group; update(t: number): void };

export function buildCity(density: number): CityResult {
  const group = new THREE.Group();
  const rand = rng(515);

  // ---------------------------------------------------------------- land
  const NA = 260;
  const NR = 130;
  const a0 = -104 * D2R;
  const a1 = 146 * D2R;
  const pos: number[] = [];
  for (let j = 0; j <= NR; j++) {
    const r = 15 + (8200 - 15) * Math.pow(j / NR, 1.75);
    for (let i = 0; i <= NA; i++) {
      const a = a0 + ((a1 - a0) * i) / NA;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      pos.push(x, landY(x, z), z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < NR; j++)
    for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i;
      const b = a + 1;
      const c = a + NA + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  landGeo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  landGeo.setIndex(idx);
  landGeo.computeVertexNormals();
  const land = new THREE.Mesh(
    landGeo,
    toonMaterial({
      color: 0x1c2446,
      shade: 0x0d1330,
      ink: 0,
      rim: 0.3,
      lights: 0,
      step: 0.3,
      fragment: /* glsl */ `
        float d = length(vWorldPos.xz);
        float nearK = 1.0 - smoothstep(500.0, 2600.0, d);
        // the valley glows warm where it is close; a cool, violet cast far away
        base = mix(base, vec3(0.14, 0.07, 0.11), nearK * 0.7);
        shade = mix(shade, vec3(0.09, 0.04, 0.08), nearK * 0.7);
        float dens = smoothstep(120.0, 260.0, d) * smoothstep(0.62, 0.86, n.y);
        // a carpet of little lights on a jittered grid
        vec2 g = vWorldPos.xz / 9.0;
        vec2 id = floor(g);
        vec2 f = fract(g);
        float h = hash12(id);
        vec2 c = 0.22 + 0.56 * hash22(id + 7.0);
        float px = max(fwidth(g.x), fwidth(g.y));
        float rad = 0.13 + 0.1 * hash11(h * 91.0);
        float dotm = smoothstep(rad, rad * 0.45, length(f - c));
        float on = step(1.0 - 0.72 * dens, h);
        float detail = smoothstep(1.1, 0.4, px);
        float avg = 0.6 * dens * 0.05;
        float e = mix(avg, dotm * on, detail);
        // street lights along a warped grid: rivers of light
        vec2 w = vWorldPos.xz + vec2(vnoise(vWorldPos.xz * 0.004), vnoise(vWorldPos.zx * 0.004 + 3.0)) * 60.0;
        vec2 sg = abs(fract(w / vec2(110.0, 85.0)) - 0.5) * vec2(110.0, 85.0);
        vec2 sw = fwidth(w) * 0.8 + 1.2;
        float street = max(smoothstep(sw.x, sw.x * 0.3, sg.x), smoothstep(sw.y, sw.y * 0.3, sg.y)) * dens;
        vec3 warm = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.78, 0.52), hash11(h * 13.0));
        vec3 cool = mix(vec3(0.35, 0.7, 1.0), vec3(0.72, 0.55, 1.0), hash11(h * 7.0));
        float wk = clamp(nearK * 1.3 + (hash11(h * 3.3) - 0.5) * 0.6, 0.0, 1.0);
        vec3 lc = mix(cool, warm, wk);
        emis += lc * e * 4.0 + mix(vec3(0.4, 0.62, 1.0), vec3(1.0, 0.56, 0.24), nearK) * street * 1.6;
        // haze of light over the whole town (brighter near the stage)
        emis += mix(vec3(0.05, 0.08, 0.2), vec3(0.3, 0.1, 0.07), nearK) * dens;`,
    }),
  );
  land.renderOrder = 30;
  group.add(land);

  // ---------------------------------------------------------------- buildings
  const lots = place(rand, density);
  // near to far, so the depth test rejects most of what stands behind
  lots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const n = lots.length;
  const bodies = new THREE.InstancedMesh(
    unitBox(),
    toonMaterial({
      color: 0x15123c,
      shade: 0x0a0826,
      ink: 0,
      rim: 1.0,
      step: 0.2,
      lights: 0,
      vertexHead: /* glsl */ `
        attribute vec3 aSize;
        attribute vec2 aSeed;
        varying vec3 vObj;
        varying vec3 vLocalN;
        varying vec3 vSize;
        flat varying vec2 vSeed;`,
      vertex: /* glsl */ `
        vObj = position * aSize;
        vLocalN = normal;
        vSize = aSize;
        vSeed = aSeed;`,
      fragmentHead: /* glsl */ `
        varying vec3 vObj;
        varying vec3 vLocalN;
        varying vec3 vSize;
        flat varying vec2 vSeed;`,
      fragment: /* glsl */ `
        float d = length(vWorldPos.xz);
        float nearK = 1.0 - smoothstep(700.0, 2800.0, d);
        float tower = vSeed.y;
        vec3 ln = floor(vLocalN + 0.5);
        if (abs(ln.y) < 0.5) {
          bool sideX = abs(ln.x) > 0.5;
          float faceW = sideX ? vSize.z : vSize.x;
          float u = (sideX ? vObj.z : vObj.x) + faceW * 0.5;
          float v = vObj.y;
          vec2 cs = mix(vec2(3.0, 3.4), vec2(2.4, 3.6), tower);
          vec2 cell = vec2(u, v) / cs;
          vec2 ci = floor(cell);
          vec2 cf = fract(cell);
          float win = step(0.32, cf.x) * step(cf.x, 0.7) * step(0.36, cf.y) * step(cf.y, 0.76);
          win *= step(3.0, v) * step(v, vSize.y - 2.5);
          float h = hash13(vec3(ci, vSeed.x * 57.0 + (ln.x + ln.z * 3.0) * 7.0));
          float litP = mix(0.22, 0.72, hash11(vSeed.x * 3.1)) * mix(0.75, 1.0, nearK);
          float lit = step(1.0 - litP, h);
          // whole floors dark, like offices after hours
          lit *= step(0.12, hash12(vec2(ci.y, vSeed.x * 13.0)));
          float px = max(fwidth(cell.x), fwidth(cell.y));
          float detail = smoothstep(0.8, 0.35, px);
          float avg = 0.38 * 0.4 * litP * 0.88;
          float e = mix(avg, win * lit, detail);
          // saturated window colours: amber and rose near the stage, blue, violet and cyan far away
          vec3 warm = mix(vec3(1.0, 0.46, 0.16), vec3(1.0, 0.64, 0.3), hash11(h * 31.0));
          if (hash11(h * 5.7) < 0.22) warm = vec3(1.0, 0.34, 0.38);
          if (hash11(h * 8.3) < 0.08) warm = vec3(1.0, 0.85, 0.62);
          vec3 cool = mix(vec3(0.28, 0.6, 1.0), vec3(0.42, 0.78, 1.0), hash11(h * 17.0));
          if (hash11(h * 2.9) < 0.25) cool = vec3(0.5, 0.36, 1.0);
          if (hash11(h * 4.1) < 0.15) cool = vec3(0.3, 0.92, 0.92);
          float wk = clamp(nearK * 1.25 + (hash11(vSeed.x * 7.7) - 0.5) * 0.7, 0.0, 1.0);
          vec3 wc = mix(cool, warm, wk);
          emis += wc * e * mix(3.2, 5.0, hash11(h * 3.0));
          vec3 glass = vec3(0.04, 0.05, 0.12);
          float gw = mix(0.2, win, detail) * 0.7;
          base = mix(base, glass, gw);
          shade = mix(shade, glass * 0.8, gw);
          // warm street glow washing up the lower floors
          float street = exp(-v / 7.0) * (0.3 + 0.7 * nearK);
          emis += mix(vec3(0.2, 0.28, 0.66), vec3(1.0, 0.42, 0.2), nearK) * street * 0.45;
          // towers wear a lit crown
          float crown = tower * step(0.45, hash11(vSeed.x * 9.1)) * smoothstep(vSize.y - 2.4, vSize.y - 2.0, v) * step(v, vSize.y - 1.3);
          vec3 cc = hsv2rgb(vec3(fract(vSeed.x * 0.37 + 0.5), 0.5, 1.0));
          emis += cc * crown * 2.2;
        } else {
          base *= 0.7; shade *= 0.7;
          // aviation light
          float top = tower * step(0.55, fract(uTime * 0.5 + vSeed.x));
          vec2 q = vObj.xz;
          emis += vec3(1.0, 0.12, 0.08) * top * smoothstep(1.6, 0.8, length(q)) * 8.0;
        }`,
    }),
    n,
  );
  const sizes = new Float32Array(n * 3);
  const seeds = new Float32Array(n * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  lots.forEach((l, i) => {
    const sink = 6;
    q.setFromAxisAngle(Y, l.rot + Math.atan2(l.x, -l.z));
    m.compose(new THREE.Vector3(l.x, l.y - sink, l.z), q, new THREE.Vector3(l.w, l.h + sink, l.d));
    bodies.setMatrixAt(i, m);
    sizes.set([l.w, l.h + sink, l.d], i * 3);
    seeds.set([rand() * 100, l.kind], i * 2);
    const far = THREE.MathUtils.smoothstep(Math.hypot(l.x, l.z), 900, 3500);
    col.setHSL(0.7 + (rand() - 0.5) * 0.1, 0.35, 0.62 + rand() * 0.25 - far * 0.1);
    bodies.setColorAt(i, col);
  });
  bodies.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  bodies.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 2));
  bodies.frustumCulled = false;
  bodies.renderOrder = 20;
  group.add(bodies);

  // ---------------------------------------------------------------- temples and pagodas
  const roofMat = toonMaterial({
    color: 0x20284c,
    shade: 0x0c1029,
    ink: 0,
    rim: 1.2,
    step: 0.2,
    lights: 0,
    fragment: /* glsl */ `
      // lanterns strung along the eaves; the underside glows warm
      float under = smoothstep(-0.2, -0.6, n.y);
      float d = length(vWorldPos.xz);
      float nearK = 1.0 - smoothstep(700.0, 3000.0, d);
      emis += mix(vec3(0.3, 0.4, 0.9), vec3(1.0, 0.48, 0.2), nearK) * under * 0.3;
      float fascia = step(abs(n.y), 0.35);
      emis += mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.68, 0.32), nearK) * fascia * 1.8;`,
  });
  const templeBodyMat = toonMaterial({
    color: 0x3a1a30,
    shade: 0x1c0c20,
    ink: 0,
    rim: 0.8,
    lights: 0,
    fragment: /* glsl */ `
      float d = length(vWorldPos.xz);
      float nearK = 1.0 - smoothstep(700.0, 3000.0, d);
      // lit openings between vermilion posts
      if (abs(n.y) < 0.5) {
        float u = (abs(n.x) > 0.5 ? vWorldPos.z : vWorldPos.x) * 0.2;
        float open = step(0.4, fract(u)) * step(fract(u), 0.8) * step(0.25, fract(vWorldPos.y * 0.08));
        emis += mix(vec3(0.45, 0.6, 1.0), vec3(1.0, 0.58, 0.28), nearK) * open * 1.2;
      }`,
  });
  const hall = hallGeometry();
  const pag = pagodaGeometry();
  type T = { x: number; z: number; s: number; rot: number };
  const halls: T[] = [];
  const pagodas: T[] = [];
  for (let i = 0; i < Math.round(170 * (0.6 + 0.4 * density)); i++) {
    const az = (-80 + rand() * 200) * D2R;
    const d = 260 + Math.pow(rand(), 1.4) * 3600;
    const x = Math.sin(az) * d;
    const z = -Math.cos(az) * d;
    if (mesaMask(x, z, 90) > 0.001 || landSlope(x, z) > 0.35) continue;
    halls.push({ x, z, s: 30 + rand() * 40 + d * 0.006, rot: az + (rand() - 0.5) * 0.4 });
  }
  const pagodaSpots = PAGODAS;
  for (const [az, d, s] of pagodaSpots) {
    const x = Math.sin(az * D2R) * d;
    const z = -Math.cos(az * D2R) * d;
    pagodas.push({ x, z, s, rot: rand() });
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: T[], scale: (t: T) => THREE.Vector3) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(Y, t.rot);
      m.compose(new THREE.Vector3(t.x, landY(t.x, t.z) - 1, t.z), q, scale(t));
      im.setMatrixAt(i, m);
    });
    im.frustumCulled = false;
    im.renderOrder = 20;
    group.add(im);
  };
  inst(hall.body, templeBodyMat, halls, (t) => new THREE.Vector3(t.s, t.s, t.s));
  inst(hall.roof, roofMat, halls, (t) => new THREE.Vector3(t.s, t.s, t.s));
  const pagodaBodyMat = toonMaterial({
    color: 0x2a1628,
    shade: 0x160a1c,
    ink: 0,
    rim: 1.0,
    lights: 0,
    fragment: /* glsl */ `
      float d = length(vWorldPos.xz);
      float nearK = 1.0 - smoothstep(700.0, 3000.0, d);
      if (abs(n.y) < 0.5) {
        float u = (abs(n.x) > 0.5 ? vWorldPos.z : vWorldPos.x) * 0.25;
        float open = step(0.42, fract(u)) * step(fract(u), 0.58);
        emis += mix(vec3(0.45, 0.6, 1.0), vec3(1.0, 0.58, 0.28), nearK) * open * 1.4;
      }`,
  });
  inst(pag.body, pagodaBodyMat, pagodas, (t) => new THREE.Vector3(t.s, t.s, t.s));
  inst(pag.roof, roofMat, pagodas, (t) => new THREE.Vector3(t.s, t.s, t.s));

  // ---------------------------------------------------------------- the mesa
  group.add(buildMesa(rand));

  // ---------------------------------------------------------------- far ridges
  group.add(buildRidges(rand));

  return {
    group,
    update() {},
  };
}

/** The table mountain: a flat top on sheer, buttressed cliffs, and its shrine. */
function buildMesa(rand: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const NT = 320;
  // radial profile: scale of the rim shape → height (fraction of MESA.h), plus ground
  const prof: [number, number][] = [
    [0, 1.0],
    [0.55, 1.0],
    [0.93, 1.0],
    [0.985, 0.975],
    [1.03, 0.82],
    [1.08, 0.6],
    [1.15, 0.4],
    [1.3, 0.2],
    [1.55, -0.05],
  ];
  const cu = Math.cos(MESA.az);
  const su = Math.sin(MESA.az);
  const toWorld = (u: number, v: number) => [MESA.x + u * cu + v * su, MESA.z + u * su - v * cu];
  const jit = Array.from({ length: NT }, () => rand());
  const pos: number[] = [];
  for (let j = 0; j < prof.length; j++) {
    const [s, hk] = prof[j];
    for (let i = 0; i <= NT; i++) {
      const th = (i / NT) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const R = 1 / Math.pow(Math.pow(Math.abs(c) / MESA.hu, 5) + Math.pow(Math.abs(sn) / MESA.hv, 5), 0.2);
      // buttresses: the cliff juts in and out
      const ii = i % NT;
      const bump = j >= 3 ? 1 + (jit[ii] - 0.5) * 0.012 * (j - 2) + Math.sin(th * 23.0) * 0.006 * (j - 2) + Math.sin(th * 61.0) * 0.003 * (j - 2) : 1;
      const rr = R * s * bump;
      const [x, z] = toWorld(c * rr, sn * rr);
      let y = MESA.h * hk;
      if (j === prof.length - 1) y = landY(x, z) - 30;
      else if (j >= 5) y = Math.max(y, landY(x, z) + 5);
      if (j < 4) y += 6 * Math.sin(x * 0.013) * Math.cos(z * 0.011) + (j >= 2 ? (jit[ii] - 0.5) * 10 : 0);
      pos.push(x, y, z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < prof.length - 1; j++)
    for (let i = 0; i < NT; i++) {
      const a = j * (NT + 1) + i;
      const b = a + 1;
      const c = a + NT + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesa = new THREE.Mesh(
    geo,
    toonMaterial({
      color: 0x1b2552,
      shade: 0x0e1537,
      ink: 46,
      rim: 1.0,
      step: 0.1,
      lights: 0,
      fog: 0.9,
      fragment: /* glsl */ `
        vec2 dc = vWorldPos.xz - vec2(${MESA.x.toFixed(1)}, ${MESA.z.toFixed(1)});
        float mu = dot(dc, vec2(${Math.cos(MESA.az).toFixed(5)}, ${Math.sin(MESA.az).toFixed(5)}));
        float cliff = 1.0 - smoothstep(0.5, 0.8, n.y);
        // gullies and buttresses down the cliffs
        float ang = atan(dc.x, dc.y);
        float st = vnoise(vec2(ang * 150.0, vWorldPos.y * 0.003)) + 0.5 * vnoise(vec2(ang * 420.0, vWorldPos.y * 0.01));
        float gully = smoothstep(0.75, 0.95, st);
        float ridge = smoothstep(0.35, 0.2, st);
        base *= 1.0 - cliff * (gully * 0.35 - ridge * 0.2);
        shade *= 1.0 - cliff * (gully * 0.4 - ridge * 0.25);
        // the top catches the moon
        base = mix(base, vec3(0.16, 0.22, 0.45), smoothstep(0.85, 0.95, n.y) * 0.5);
        // scattered lights on the lower slopes
        vec2 g = vec2(ang * 260.0, vWorldPos.y / 14.0);
        vec2 id = floor(g);
        float h = hash12(id);
        float px = max(fwidth(g.x), fwidth(g.y));
        float dotm = smoothstep(0.3, 0.1, length(fract(g) - 0.5)) * step(0.93, h);
        float e = mix(0.07 * 0.07, dotm, smoothstep(1.0, 0.4, px));
        emis += mix(vec3(0.4, 0.85, 1.0), vec3(1.0, 0.7, 0.4), step(0.985, h)) * e * 3.0 * smoothstep(${(MESA.h * 0.7).toFixed(1)}, ${(MESA.h * 0.2).toFixed(1)}, vWorldPos.y);
        // the lantern path zigzagging up the front cliff to the torii
        float yy = vWorldPos.y / ${MESA.h.toFixed(1)};
        float zz = abs(fract(yy * 4.5) - 0.5) * 2.0;
        float pathU = ${(240).toFixed(1)} + (zz - 0.5) * 150.0;
        float onPath = smoothstep(9.0, 3.0, abs(mu - pathU)) * step(0.06, yy) * step(yy, 0.99) * step(-0.2, dot(dc, vec2(${(-Math.sin(MESA.az)).toFixed(5)}, ${Math.cos(MESA.az).toFixed(5)})));
        float beads = step(0.45, fract(vWorldPos.y / 11.0));
        emis += vec3(1.0, 0.62, 0.3) * onPath * mix(0.5, beads, smoothstep(1.2, 0.5, px)) * 2.6;`,
    }),
  );
  mesa.renderOrder = 40;
  g.add(mesa);

  // The shrine on the top: a great hall, a pagoda, side halls, a torii at the
  // head of the cliff path and a lantern-lit wall along the edge. Dark
  // silhouettes drawn with thin lines of light, as the town sees it at night.
  const top = MESA.h + 4;
  const [cx, cz] = toWorld(0, 0);
  const rot = -MESA.az;
  const bodyParts: THREE.BufferGeometry[] = [];
  const roofParts: THREE.BufferGeometry[] = [];
  const toriiParts: THREE.BufferGeometry[] = [];
  const at = (geo: THREE.BufferGeometry, u: number, v: number, y: number) => {
    const [x, z] = toWorld(u, v);
    geo.rotateY(rot);
    geo.translate(x - cx, y, z - cz);
    return geo;
  };
  const hallU = 240;
  const hallV = -120;
  const hb = unitBox();
  hb.scale(300, 78, 150);
  bodyParts.push(at(hb, hallU, hallV, top));
  const hr = hipRoof(215, 80, 92, 0.16, 7);
  hr.scale(1, 1, 0.64);
  roofParts.push(at(hr, hallU, hallV, top + 74));
  const hr2 = hipRoof(95, 30, 52, 0.12, 5);
  hr2.scale(1, 1, 0.52);
  roofParts.push(at(hr2, hallU, hallV, top + 156));
  // the pagoda
  const pg = pagodaGeometry();
  const pb = pg.body.clone();
  pb.scale(300, 300, 300);
  bodyParts.push(at(pb, -430, -60, top));
  const pr = pg.roof.clone();
  pr.scale(300, 300, 300);
  roofParts.push(at(pr, -430, -60, top));
  // side halls
  for (const [u, v, w, h] of [
    [-120, -40, 150, 40],
    [560, -30, 170, 44],
    [30, -250, 90, 26],
    [440, -270, 90, 26],
    [-640, -150, 120, 30],
  ]) {
    const b = unitBox();
    b.scale(w, h, w * 0.5);
    bodyParts.push(at(b, u, v, top));
    const r = hipRoof(w * 0.68, w * 0.24, h * 0.95, 0.12, 3);
    r.scale(1, 1, 0.56);
    roofParts.push(at(r, u, v, top + h - 2));
  }
  // lantern wall along the front edge
  const wall = unitBox();
  wall.scale(1250, 12, 8);
  bodyParts.push(at(wall, 60, -MESA.hv * 0.86, top - 2));
  // the torii at the head of the path
  const tU = hallU;
  const tV = -MESA.hv * 0.8;
  for (const du of [-52, 52]) {
    const p = new THREE.CylinderGeometry(6.5, 7.5, 140, 8);
    p.translate(0, 70, 0);
    toriiParts.push(at(p, tU + du, tV, top - 6));
  }
  const kb = unitBox();
  kb.scale(176, 13, 14);
  toriiParts.push(at(kb, tU, tV, top + 132));
  const nuki = unitBox();
  nuki.scale(140, 8, 8);
  toriiParts.push(at(nuki, tU, tV, top + 104));
  const shrine = new THREE.Group();
  const sb = new THREE.Mesh(
    merge(bodyParts),
    toonMaterial({
      color: 0x1e1230,
      shade: 0x10081c,
      ink: 0,
      rim: 1.2,
      lights: 0,
      fog: 0.55,
      fragment: /* glsl */ `
        if (abs(n.y) < 0.5) {
          // rows of small lit windows
          vec2 g = vec2((vWorldPos.x + vWorldPos.z) / 7.0, vWorldPos.y / 9.0);
          vec2 f = fract(g);
          float w = step(0.35, f.x) * step(f.x, 0.65) * step(0.4, f.y) * step(f.y, 0.7) * step(0.45, hash12(floor(g)));
          float px = max(fwidth(g.x), fwidth(g.y));
          emis += vec3(1.0, 0.6, 0.3) * mix(0.05, w, smoothstep(0.9, 0.4, px)) * 2.4;
          // the lantern wall: a dotted line of light along its top
          emis += vec3(1.0, 0.7, 0.4) * step(${(MESA.h + 6).toFixed(1)}, vWorldPos.y) * step(vWorldPos.y, ${(MESA.h + 10).toFixed(1)}) * step(0.5, fract((vWorldPos.x - vWorldPos.z) / 14.0)) * 1.8;
        }`,
    }),
  );
  const sr = new THREE.Mesh(
    merge(roofParts),
    toonMaterial({
      color: 0x161c40,
      shade: 0x0a0d24,
      ink: 0,
      rim: 1.6,
      lights: 0,
      fog: 0.55,
      fragment: /* glsl */ `
        float under = smoothstep(-0.2, -0.6, n.y);
        float fascia = step(abs(n.y), 0.35);
        emis += vec3(1.0, 0.5, 0.22) * under * 0.06 + vec3(1.0, 0.72, 0.4) * fascia * 1.1;`,
    }),
  );
  const st = new THREE.Mesh(
    merge(toriiParts),
    toonMaterial({ color: 0xe0482c, shade: 0x7a1c2a, ink: 0, rim: 1.0, lights: 0, fog: 0.45, emissive: 0x9a2410 }),
  );
  shrine.add(sb, sr, st);
  shrine.position.set(cx, 0, cz);
  for (const o of [shrine, sb, sr, st]) o.renderOrder = 38;
  g.add(shrine);
  return g;
}

/** Far mountain ranges: two silhouette strips far beyond the valley. */
function buildRidges(rand: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const layer = (d: number, hBase: number, hVar: number, seed: number, color: number, shade: number, fog: number, order: number) => {
    const N = 360;
    const a0 = -110 * D2R;
    const a1 = 155 * D2R;
    const pos: number[] = [];
    const ph = [rand() * 6, rand() * 6, rand() * 6, rand() * 6];
    for (let i = 0; i <= N; i++) {
      const a = a0 + ((a1 - a0) * i) / N;
      const t = a * 3.0 + seed;
      let h = hBase + hVar * (0.5 + 0.28 * Math.sin(t * 1.3 + ph[0]) + 0.16 * Math.sin(t * 3.1 + ph[1]) + 0.08 * Math.abs(Math.sin(t * 7.3 + ph[2])) + 0.04 * Math.sin(t * 17.0 + ph[3]));
      // leave the sky clear right behind the mesa
      const dm = Math.abs(a - MESA.az);
      h *= 0.72 + 0.28 * THREE.MathUtils.smoothstep(dm, 0.1, 0.45);
      const dd = d * (1 + 0.06 * Math.sin(t * 2.0));
      const x = Math.sin(a) * dd;
      const z = -Math.cos(a) * dd;
      pos.push(x, h, z, x, -300, z);
    }
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      toonMaterial({
        color,
        shade,
        ink: 0,
        rim: 1.0,
        lights: 0,
        fog,
        side: THREE.DoubleSide,
        fragment: /* glsl */ `
          vec3 cam2 = vWorldPos - cameraPosition;
          n = normalize(vec3(-cam2.x, 0.0, -cam2.z));
          // scattered village lights on the lower slopes
          vec2 gg = vec2(atan(vWorldPos.x, -vWorldPos.z) * 900.0, vWorldPos.y / 18.0);
          float h = hash12(floor(gg));
          float px = max(fwidth(gg.x), fwidth(gg.y));
          float dotm = smoothstep(0.32, 0.1, length(fract(gg) - 0.5)) * step(0.95, h) * smoothstep(${(hBase + hVar * 0.4).toFixed(1)}, 0.0, vWorldPos.y);
          emis += vec3(0.45, 0.7, 1.0) * mix(0.004, dotm, smoothstep(1.0, 0.4, px)) * 2.5;`,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    g.add(mesh);
  };
  layer(8200, 420, 780, 1.7, 0x22305e, 0x121a40, 1.0, 50);
  layer(12500, 900, 1300, 4.2, 0x1e2a58, 0x141c44, 1.25, 51);
  return g;
}
