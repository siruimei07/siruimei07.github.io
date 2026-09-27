import * as THREE from "three";

// The world's plan. One hillside street runs from the viewer's feet straight
// down to the bay (−z). Poles line its right side, houses both sides; beyond
// the shore lie the harbour, the bridge and the far city under the moon.
// Units: metres, y up, sea level y = 0.

export const STREET_TOP_Z = 10;
export const SHORE_Z = -336;
export const STREET_HALF = 3.5; // asphalt half-width
export const WALK = 1.3; // sidewalk width

/** Height of the street centreline: steep at the top, flattening at the shore. */
export function streetY(z: number): number {
  const t = THREE.MathUtils.clamp((STREET_TOP_Z - z) / (STREET_TOP_Z - (SHORE_Z + 6)), 0, 1);
  return 3 + 37 * Math.pow(1 - t, 1.35);
}

/** Shoreline z for a given x: headlands reach further out at the sides. */
export function shoreZ(x: number): number {
  const a = Math.abs(x);
  return SHORE_Z - 520 * THREE.MathUtils.smoothstep(a, 260, 1500) - 80 * Math.sin(x * 0.004) * THREE.MathUtils.smoothstep(a, 120, 600);
}

const hill = (x: number, z: number, cx: number, cz: number, r: number, h: number) => {
  const d = Math.hypot(x - cx, (z - cz) * 1.2) / r;
  return h * Math.exp(-d * d);
};

/** Terrain height anywhere on land (and gently below the sea past the shore). */
export function groundY(x: number, z: number): number {
  const ax = Math.abs(x);
  // the street sits in a shallow fold; the sides step up
  const side = 0.07 * Math.max(0, ax - 7) + 0.00004 * ax * ax;
  const sz = shoreZ(x);
  // coastal profile: the street profile, remapped per-x to that x's shoreline
  const zRel = z * (SHORE_Z / Math.min(-1, sz));
  let y = streetY(zRel) + side * THREE.MathUtils.smoothstep(z, sz, sz + 120);
  // hills behind and at the headlands
  y += hill(x, z, -900, -380, 420, 90) + hill(x, z, 1100, -520, 480, 120) + hill(x, z, -500, 900, 420, 60) + hill(x, z, 600, 850, 380, 50);
  // drop under the sea past the shore
  // (three's smoothstep needs min < max: 0 inland, 1 out past the shore)
  const beyond = 1 - THREE.MathUtils.smoothstep(z, sz - 30, sz + 4);
  y = THREE.MathUtils.lerp(y, -6, beyond);
  return y;
}

// The moon over the bay: slightly right of the street axis, low above the bridge.
export const MOON_AZ = THREE.MathUtils.degToRad(5.5);
export const MOON_EL = THREE.MathUtils.degToRad(8.2);
export const moonDir = new THREE.Vector3(Math.sin(MOON_AZ) * Math.cos(MOON_EL), Math.sin(MOON_EL), -Math.cos(MOON_AZ) * Math.cos(MOON_EL)).normalize();

// Utility poles on the right side of the street; the gaming pole is the first.
export const POLE_X = STREET_HALF + WALK * 0.55;
export const POLE_ZS = [-19, -45, -71, -97, -123, -149, -175, -201, -227, -253, -279, -305];
export const GAMING_POLE = 0; // index into POLE_ZS
export const POLE_HEIGHT = 12;

// Bridge across the bay (towers), and the far city.
export const BRIDGE = { z: -2550, x0: -2100, x1: 1700, towerA: -620, towerB: 520, towerH: 185, deckY: 52 };
export const CITY_Z = -3900;
export const CITY_X: [number, number] = [-5200, 5200];

// A deterministic PRNG so the town is the same on every visit.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
