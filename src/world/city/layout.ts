import * as THREE from "three";

// World B's ground plan (metres; the lake surface is y = 0, the city lies
// toward -z). Everything procedural here is deterministic so the reflection,
// the terrain glow and the camera paths agree with the buildings.
//
//   z = +12      the great gate on the arrival platform (faces the city)
//   z = -20      front of the platform, start of the bridge
//   z = -330     the shore, a stone embankment and the lower town
//   z = -950     the mesa with the castle, ~170 m up

export const PLATFORM = { x0: -26, x1: 26, z0: -20, z1: 16, y: 2.2 };
export const GATE_Z = 12;
export const BRIDGE = { z0: -20, z1: -300, width: 9, y0: 2.2, rise: 4.0 };
export const SHORE_Z = -300;
export const MESA = { x: 0, z: -800, r: 105, h: 205 };

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const sat = (x: number) => Math.min(1, Math.max(0, x));

function vnoise2(x: number, z: number, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = smooth(fx);
  const v = smooth(fz);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}

/** Ground height of the hill city (0 at and beyond the shore line). */
export function terrainHeight(x: number, z: number) {
  if (z > SHORE_Z + 6) return -4;
  // Distance up the slope from the shore.
  const up = sat((SHORE_Z - z) / 500);
  // Main mound toward the mesa + side ridges; flatter near the shore.
  const dx = x - MESA.x;
  const dz = z - MESA.z;
  const rMesa = Math.hypot(dx, dz * 1.1);
  const mound = MESA.h * Math.pow(sat(1 - (rMesa - MESA.r) / 470), 1.45);
  const top = rMesa < MESA.r ? MESA.h : mound;
  const ridgeL = 120 * Math.exp(-Math.pow((x + 400) / 200, 2)) * Math.pow(up, 1.1);
  const ridgeR = 105 * Math.exp(-Math.pow((x - 430) / 180, 2)) * Math.pow(up, 1.05);
  let h = Math.max(top, ridgeL, ridgeR, 6 + up * 30);
  // Terraces: the town steps up the hill in levels.
  const terr = 9;
  const stepped = Math.floor(h / terr) * terr + smooth(sat(((h / terr) % 1 - 0.75) / 0.25)) * terr;
  h = THREE.MathUtils.lerp(h, stepped, 0.55 * sat(1 - h / 150));
  h += (vnoise2(x * 0.02, z * 0.02, 3) - 0.5) * 8 * up;
  // Embankment: a low wall at the shore.
  const shore = sat((SHORE_Z - z) / 12);
  return THREE.MathUtils.lerp(-4, h, shore) + (shore > 0 && shore < 1 ? 3.5 * shore : 0);
}

// The low flight through the city (closed loop) — the final chapter.
export const FLY_POINTS: [number, number, number][] = [
  [0, 20, -275],
  [-40, 28, -345],
  [-105, 38, -395],
  [-160, 52, -455],
  [-140, 76, -545],
  [-60, 96, -600],
  [40, 98, -585],
  [110, 84, -515],
  [150, 62, -435],
  [110, 42, -365],
  [50, 26, -310],
];
export const flyCurve = new THREE.CatmullRomCurve3(
  FLY_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  true,
  "centripetal",
);

// Streets: the flight path is kept clear, plus a few avenues up the hill.
function streetDist(x: number, z: number) {
  let d = 1e9;
  // Flight corridor, sampled.
  for (let i = 0; i < FLY_SAMPLES.length; i++) {
    const p = FLY_SAMPLES[i];
    const dd = Math.hypot(x - p.x, z - p.z);
    if (dd < d) d = dd;
  }
  // Central avenue from the bridge up to the mesa.
  d = Math.min(d, Math.abs(x - 0) + Math.max(0, z - SHORE_Z) * 10);
  // Shore promenade.
  d = Math.min(d, Math.abs(z - (SHORE_Z - 22)) * 1.2);
  return d;
}
const FLY_SAMPLES = flyCurve.getSpacedPoints(160);

export type Building = {
  x: number;
  z: number;
  y: number; // ground height
  w: number;
  d: number;
  h: number; // wall height
  rot: number;
  kind: 0 | 1 | 2; // 0 machiya, 1 hall, 2 tower
  roof: number; // roof height
  seed: number;
};

export type Landmarks = {
  pagoda: THREE.Vector3;
  hall: THREE.Vector3;
  castle: THREE.Vector3;
};

export const LANDMARKS: Landmarks = {
  pagoda: new THREE.Vector3(62, 0, -468),
  hall: new THREE.Vector3(-72, 0, -430),
  castle: new THREE.Vector3(0, 0, -800),
};
for (const k of Object.keys(LANDMARKS) as (keyof Landmarks)[]) {
  const p = LANDMARKS[k];
  p.y = terrainHeight(p.x, p.z);
}

export function placeBuildings(density: number, seed = 42): Building[] {
  const rng = mulberry32(seed);
  const out: Building[] = [];
  const step = 15 / Math.sqrt(Math.max(0.35, density));
  for (let z = SHORE_Z - 26; z > -1080; z -= step) {
    for (let x = -620; x < 620; x += step) {
      const jx = x + (rng() - 0.5) * step * 0.7;
      const jz = z + (rng() - 0.5) * step * 0.7;
      const r = Math.hypot(jx - MESA.x, (jz - MESA.z) * 1.1);
      if (r < MESA.r + 10) continue; // the castle keeps the mesa to itself
      const sd = streetDist(jx, jz);
      if (sd < 13) continue;
      // Keep clear around landmarks.
      if (Math.hypot(jx - LANDMARKS.pagoda.x, jz - LANDMARKS.pagoda.z) < 30) continue;
      if (Math.hypot(jx - LANDMARKS.hall.x, jz - LANDMARKS.hall.z) < 42) continue;
      // Thin out toward the edges and the far hills; leave groves (dark
      // patches of forest) between neighbourhoods.
      const edge = Math.abs(jx) / 620;
      const far = (SHORE_Z - jz) / 780;
      if (rng() < edge * edge * 0.8 + far * 0.3) continue;
      const grove = vnoise2(jx * 0.012, jz * 0.012, 9);
      if (grove < 0.34 && sd > 26) continue;
      const y = terrainHeight(jx, jz);
      const isTower = rng() < 0.012 && sd > 30;
      const isHall = !isTower && rng() < 0.05;
      const seedB = rng();
      if (isTower) {
        // A tall watch-tower / tiered hall, the odd landmark on the skyline.
        const w = 10 + rng() * 4;
        out.push({ x: jx, z: jz, y, w, d: w, h: 16 + rng() * 10, rot: rng() * 0.6, kind: 1, roof: 7, seed: seedB });
      } else if (isHall) {
        const w = 18 + rng() * 10;
        out.push({ x: jx, z: jz, y, w, d: w * 0.7, h: 7 + rng() * 3, rot: (rng() - 0.5) * 0.3, kind: 1, roof: 7 + rng() * 3, seed: seedB });
      } else {
        const w = 8 + rng() * 5;
        const floors = rng() < 0.6 ? 2 : rng() < 0.7 ? 1 : 3;
        out.push({ x: jx, z: jz, y, w, d: 7 + rng() * 5, h: floors * 3.3 + 0.6, rot: (rng() - 0.5) * 0.25, kind: 0, roof: 3.0 + rng() * 1.6, seed: seedB });
      }
    }
  }
  return out;
}

/** Points for the sakura groves: along the shore and in clusters up the hill. */
export function placeSakura(count: number, seed = 7) {
  const rng = mulberry32(seed);
  const pts: THREE.Vector4[] = [];
  const clusters = [
    [-45, -318, 55],
    [60, -322, 45],
    [-150, -370, 40],
    [140, -385, 45],
    [20, -430, 30],
    [-95, -510, 40],
    [110, -560, 35],
    [-30, -640, 40],
    [205, -470, 40],
    [-225, -430, 40],
  ];
  let guard = 0;
  while (pts.length < count && guard++ < count * 30) {
    const c = clusters[Math.floor(rng() * clusters.length)];
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * c[2];
    const x = c[0] + Math.cos(a) * r;
    const z = c[1] + Math.sin(a) * r;
    if (z > SHORE_Z - 8) continue;
    if (streetDist(x, z) < 6) continue;
    const y = terrainHeight(x, z);
    pts.push(new THREE.Vector4(x, y, z, 4 + rng() * 3.5));
  }
  return pts;
}
