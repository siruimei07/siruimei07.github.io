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
export const BRIDGE = { z0: -20, z1: -330, width: 9, y0: 2.2, rise: 4.2 };
export const SHORE_Z = -330;
export const MESA = { x: 0, z: -960, r: 95, h: 172 };

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
  const up = sat((SHORE_Z - z) / 640);
  // Main mound toward the mesa + side ridges; flatter near the shore.
  const dx = x - MESA.x;
  const dz = z - MESA.z;
  const rMesa = Math.hypot(dx, dz * 1.1);
  const mound = MESA.h * Math.pow(sat(1 - (rMesa - MESA.r) / 560), 1.6);
  const top = rMesa < MESA.r ? MESA.h : mound;
  const ridgeL = 95 * Math.exp(-Math.pow((x + 420) / 190, 2)) * Math.pow(up, 1.2);
  const ridgeR = 80 * Math.exp(-Math.pow((x - 460) / 170, 2)) * Math.pow(up, 1.1);
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
  [0, 16, -300],
  [-40, 24, -380],
  [-110, 30, -430],
  [-170, 40, -500],
  [-150, 56, -600],
  [-60, 70, -660],
  [40, 72, -640],
  [110, 62, -560],
  [150, 48, -470],
  [110, 34, -400],
  [50, 22, -350],
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
  pagoda: new THREE.Vector3(70, 0, -520),
  hall: new THREE.Vector3(-70, 0, -470),
  castle: new THREE.Vector3(0, 0, -960),
};
for (const k of Object.keys(LANDMARKS) as (keyof Landmarks)[]) {
  const p = LANDMARKS[k];
  p.y = terrainHeight(p.x, p.z);
}

export function placeBuildings(density: number, seed = 42): Building[] {
  const rng = mulberry32(seed);
  const out: Building[] = [];
  const step = 15 / Math.sqrt(Math.max(0.35, density));
  for (let z = SHORE_Z - 30; z > -1180; z -= step) {
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
      // Thin out toward the edges and the far hills.
      const edge = Math.abs(jx) / 620;
      const far = (SHORE_Z - jz) / 850;
      if (rng() < edge * edge * 0.8 + far * 0.25) continue;
      const y = terrainHeight(jx, jz);
      // Towers cluster on the left, mid-hill (the "virtual" skyline).
      const towerZone = Math.exp(-Math.pow((jx + 300) / 150, 2) - Math.pow((jz + 720) / 170, 2));
      const isTower = rng() < towerZone * 0.75;
      const isHall = !isTower && rng() < 0.05;
      const seedB = rng();
      if (isTower) {
        const w = 14 + rng() * 10;
        out.push({ x: jx, z: jz, y, w, d: w * (0.8 + rng() * 0.4), h: 40 + Math.pow(rng(), 1.5) * 110, rot: 0, kind: 2, roof: 0, seed: seedB });
      } else if (isHall) {
        const w = 18 + rng() * 10;
        out.push({ x: jx, z: jz, y, w, d: w * 0.7, h: 7 + rng() * 3, rot: (rng() - 0.5) * 0.3, kind: 1, roof: 7 + rng() * 3, seed: seedB });
      } else {
        const w = 8 + rng() * 5;
        const floors = 1 + Math.floor(rng() * 2.6);
        out.push({ x: jx, z: jz, y, w, d: 7 + rng() * 5, h: floors * 3.6 + 1, rot: (rng() - 0.5) * 0.25, kind: 0, roof: 2.6 + rng() * 1.4, seed: seedB });
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
    [-40, -345, 60],
    [60, -350, 50],
    [-150, -400, 40],
    [140, -420, 45],
    [20, -470, 35],
    [-90, -560, 40],
    [110, -610, 35],
    [-30, -700, 40],
    [200, -520, 40],
    [-220, -470, 40],
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
