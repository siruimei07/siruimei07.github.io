import * as THREE from "three";
import { dirFromAzEl } from "../common/env";

// The plan of the stage (舞台). Units: metres, y up. The wooden deck is y = 0
// and faces −z, out over the valley of Tsukuyomi; its far edge is the
// balustrade. Behind the viewer (+z) the stone steps climb through the great
// vermilion gate onto the deck. The city lies far below and rises on the far
// side of the valley to the table mountain with its shrine, under the moon.

/** The wooden deck. */
export const DECK = { x0: -15, x1: 15, zFront: -15, zBack: 0.7 };
/** Stone threshold of the gate (the pillars stand on it). */
export const SILL = { z0: 0.7, z1: 3.0 };
/** The great pillars. */
export const GATE = { z: 1.8, x: 5.6, r: 0.64, outerX: 16.8, lintelY: 6.3, lintelH: 0.7, capY: 7.0, eaveZ: -2.2, eaveY: 8.9 };
/** Stone steps down from the threshold toward +z. */
export const STEPS = { z0: 3.0, n: 18, rise: 0.15, run: 0.42, half: 4.0 };
/** The balustrade (高欄) along the front edge and down both sides. */
export const RAIL = { z: -15, top: 1.08, spacing: 2.05, side: 15 };
/** The two big newel posts (親柱) with bronze onion caps flanking the opening in the middle. */
export const DRUM = { x: 2.85, r: 0.27, h: 1.5 };

/** Paper lanterns (提灯) hanging along the gate's eave: centre of each body. */
export const LANTERNS: THREE.Vector3[] = [];
for (const x of [-13.3, -10.5, -7.7, -3.9, 3.9, 7.7, 10.5, 13.3]) LANTERNS.push(new THREE.Vector3(x, 5.75, -1.55));
/** Stone lanterns (石灯籠) on the deck: centre of the fire box. */
export const STONE_LANTERNS = [new THREE.Vector3(-7.6, 1.47, -12.6), new THREE.Vector3(7.6, 1.47, -12.6)];

export const stepY = (i: number) => -(i + 1) * STEPS.rise;
/** Floor height anywhere on the stairs (for placing cameras). */
export function stairsY(z: number) {
  if (z <= STEPS.z0) return 0;
  const i = Math.min(STEPS.n - 1, Math.floor((z - STEPS.z0) / STEPS.run));
  return stepY(i);
}

// The moon hangs high over the right third of the view, above the mesa.
export const MOON_AZ = 31;
export const MOON_EL = 16;
export const moonDir = dirFromAzEl(MOON_AZ, MOON_EL);

// The table mountain across the valley, crowned by a shrine.
const MESA_AZ = THREE.MathUtils.degToRad(16);
export const MESA = {
  d: 4700,
  x: Math.sin(MESA_AZ) * 4700,
  z: -Math.cos(MESA_AZ) * 4700,
  /** Half extents across / along the view, top height. */
  hu: 900,
  hv: 430,
  h: 1000,
  az: MESA_AZ,
};

const sm = THREE.MathUtils.smoothstep;

/** Mesa footprint: 0 outside, 1 on the flat top (a rounded rectangle across the view). */
export function mesaMask(x: number, z: number, grow = 0) {
  const dx = x - MESA.x;
  const dz = z - MESA.z;
  const u = dx * Math.cos(MESA.az) + dz * Math.sin(MESA.az);
  const v = dx * Math.sin(MESA.az) - dz * Math.cos(MESA.az);
  const r = Math.pow(Math.pow(Math.abs(u) / (MESA.hu + grow), 4) + Math.pow(Math.abs(v) / (MESA.hv + grow), 4), 0.25);
  return 1 - sm(r, 0.92, 1.18);
}

/**
 * The land beyond the stage: the hillside under the deck falls to the valley
 * floor, the far side climbs toward the mesa, hills close the valley at the
 * sides. Gentle waves keep it from looking like a funnel.
 */
export function landY(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const az = Math.atan2(x, -z);
  const fall = -46 * sm(d, 16, 120);
  const riseK = 0.12 * (1 + 0.18 * Math.sin(az * 2.6 + 0.7));
  const rise = Math.max(0, d - 480) * riseK - Math.max(0, d - 2600) * 0.05;
  const sides = 260 * sm(Math.abs(az - 0.35), 0.95, 1.55) * sm(d, 250, 1300);
  const waves = (18 * Math.sin(x * 0.0041 + Math.cos(z * 0.0033) * 2.0) * Math.sin(z * 0.0052 + 1.3) + 9 * Math.sin(x * 0.011 - z * 0.007)) * sm(d, 200, 900);
  let y = fall + rise + sides + waves;
  const m = mesaMask(x, z);
  if (m > 0) y = THREE.MathUtils.lerp(y, MESA.h + 8 * Math.sin(x * 0.013) * Math.cos(z * 0.011), m);
  return y;
}

/** Surface steepness (0 flat … 1 cliff), for placing buildings. */
export function landSlope(x: number, z: number) {
  const e = 6;
  const gx = (landY(x + e, z) - landY(x - e, z)) / (2 * e);
  const gz = (landY(x, z + e) - landY(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}
